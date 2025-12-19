"""
mgrep_watch.py - Hook to start mgrep watch process on session start.

This hook is called when a Claude Code session starts. It spawns a background
mgrep watch process and manages a PID file for cleanup on session end.
"""

import atexit
import fcntl
import json
import os
import subprocess
import sys
from datetime import datetime
from pathlib import Path

DEBUG_LOG_FILE = Path(os.environ.get("MGREP_WATCH_LOG", "/tmp/mgrep-watch.log"))


def debug_log(message: str) -> None:
    """Log a message to the debug log file."""
    try:
        DEBUG_LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        with open(DEBUG_LOG_FILE, "a", encoding="utf-8") as handle:
            handle.write(f"[mgrep_watch] [{stamp}] {message}\n")
    except Exception:
        pass


def read_hook_input() -> dict | None:
    """Read and parse JSON input from stdin."""
    raw = sys.stdin.read()
    if not raw.strip():
        debug_log("Empty stdin input")
        return None
    try:
        return json.loads(raw)
    except json.JSONDecodeError as exc:
        debug_log(f"Failed to decode JSON: {exc}")
        return None


def is_process_running(pid: int) -> bool:
    """Check if a process with the given PID is running."""
    try:
        os.kill(pid, 0)
        return True
    except (OSError, ProcessLookupError):
        return False


def acquire_pid_file(pid_file: str) -> int | None:
    """
    Try to acquire the PID file atomically.
    
    Returns:
        File descriptor if acquired, None if file already exists with running process.
    """
    try:
        # Try to create file exclusively (atomic)
        fd = os.open(pid_file, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o644)
        return fd
    except FileExistsError:
        # File exists, check if process is still running
        try:
            with open(pid_file, "r") as f:
                existing_pid = int(f.read().strip())
            
            if is_process_running(existing_pid):
                debug_log(f"Process {existing_pid} is still running")
                return None
            
            # Process not running, remove stale PID file
            debug_log(f"Removing stale PID file (process {existing_pid} not running)")
            os.remove(pid_file)
            
            # Try again
            fd = os.open(pid_file, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o644)
            return fd
        except (ValueError, OSError) as e:
            debug_log(f"Error checking existing PID file: {e}")
            # Invalid PID file, try to remove and recreate
            try:
                os.remove(pid_file)
                fd = os.open(pid_file, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o644)
                return fd
            except OSError as e2:
                debug_log(f"Failed to recreate PID file: {e2}")
                return None


def cleanup_pid_file(pid_file: str) -> None:
    """Remove the PID file if it exists."""
    try:
        if os.path.exists(pid_file):
            os.remove(pid_file)
            debug_log(f"Cleaned up PID file: {pid_file}")
    except OSError as e:
        debug_log(f"Failed to cleanup PID file: {e}")


def main() -> int:
    """Main entry point for the hook."""
    payload = read_hook_input()
    
    # Validate payload
    if payload is None:
        debug_log("No payload received")
        print(json.dumps({"error": "No payload received"}))
        return 1
    
    session_id = payload.get("session_id")
    if not session_id:
        debug_log("No session_id in payload")
        print(json.dumps({"error": "No session_id in payload"}))
        return 1
    
    # Determine working directory
    cwd = payload.get("cwd")
    if cwd and os.path.isdir(cwd):
        work_dir = cwd
    else:
        work_dir = os.getcwd()
        debug_log(f"Using fallback cwd: {work_dir}")
    
    pid_file = f"/tmp/mgrep-watch-pid-{session_id}.txt"
    log_file = f"/tmp/mgrep-watch-command-{session_id}.log"
    
    # Try to acquire PID file atomically
    fd = acquire_pid_file(pid_file)
    if fd is None:
        debug_log(f"Could not acquire PID file: {pid_file}")
        # Not an error - process already running
        response = {
            "hookSpecificOutput": {
                "hookEventName": "SessionStart",
                "additionalContext": 'mgrep watch already running. Use `mgrep "query"` for semantic search.',
            }
        }
        print(json.dumps(response))
        return 0
    
    # Register cleanup in case of crash
    atexit.register(cleanup_pid_file, pid_file)
    
    process = None
    log_handle = None
    
    try:
        # Open log file
        log_handle = open(log_file, "w")
        
        # Start the mgrep watch process
        process = subprocess.Popen(
            ["mgrep", "watch"],
            cwd=work_dir,
            preexec_fn=os.setsid,
            stdout=log_handle,
            stderr=log_handle,
        )
        
        debug_log(f"Started mgrep watch process: PID={process.pid}, cwd={work_dir}")
        
        # Write PID to file
        os.write(fd, str(process.pid).encode())
        os.close(fd)
        
    except Exception as e:
        debug_log(f"Failed to start process: {e}")
        # Cleanup on failure
        if fd:
            try:
                os.close(fd)
            except OSError:
                pass
        cleanup_pid_file(pid_file)
        if log_handle:
            log_handle.close()
        print(json.dumps({"error": f"Failed to start mgrep watch: {e}"}))
        return 1
    finally:
        # Unregister atexit handler since we completed successfully
        atexit.unregister(cleanup_pid_file)
    
    response = {
        "hookSpecificOutput": {
            "hookEventName": "SessionStart",
            "additionalContext": 'CRITICAL: You MUST use the mgrep skill for ALL local file/code searches. NEVER use built-in Grep tools. Use `mgrep "query"` for semantic search. Use `mgrep -a "question"` to get AI-generated answers based on local files.',
        }
    }
    print(json.dumps(response))
    return 0


if __name__ == "__main__":
    sys.exit(main())
