"""
mgrep_watch_kill.py - Hook to stop mgrep watch process on session end.

This hook is called when a Claude Code session ends. It gracefully terminates
the mgrep watch process using SIGTERM, falling back to SIGKILL if needed.
"""

import json
import os
import signal
import sys
import time
from datetime import datetime
from pathlib import Path

DEBUG_LOG_FILE = Path(os.environ.get("MGREP_WATCH_KILL_LOG", "/tmp/mgrep-watch-kill.log"))

SIGTERM_TIMEOUT = 3  # seconds to wait for graceful shutdown


def debug_log(message: str) -> None:
    """Log a message to the debug log file."""
    try:
        DEBUG_LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        with open(DEBUG_LOG_FILE, "a", encoding="utf-8") as handle:
            handle.write(f"[mgrep_watch_kill] [{stamp}] {message}\n")
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


def terminate_process(pid: int) -> bool:
    """
    Gracefully terminate a process.
    
    Sends SIGTERM first and waits for graceful shutdown.
    Falls back to SIGKILL if process doesn't exit in time.
    
    Returns:
        True if process was terminated, False if it wasn't running.
    """
    if not is_process_running(pid):
        debug_log(f"Process {pid} is not running")
        return False
    
    # Try SIGTERM first for graceful shutdown
    try:
        debug_log(f"Sending SIGTERM to process {pid}")
        os.kill(pid, signal.SIGTERM)
    except (ProcessLookupError, PermissionError) as e:
        debug_log(f"Failed to send SIGTERM: {e}")
        return False
    
    # Wait for graceful termination
    start_time = time.time()
    while time.time() - start_time < SIGTERM_TIMEOUT:
        if not is_process_running(pid):
            debug_log(f"Process {pid} terminated gracefully")
            return True
        time.sleep(0.1)
    
    # Process still running, use SIGKILL
    if is_process_running(pid):
        try:
            debug_log(f"Sending SIGKILL to process {pid}")
            os.kill(pid, signal.SIGKILL)
            time.sleep(0.1)  # Brief wait for kernel cleanup
        except (ProcessLookupError, PermissionError) as e:
            debug_log(f"Failed to send SIGKILL: {e}")
    
    return not is_process_running(pid)


def cleanup_pid_file(pid_file: str) -> None:
    """Remove the PID file if it exists."""
    try:
        if os.path.exists(pid_file):
            os.remove(pid_file)
            debug_log(f"Removed PID file: {pid_file}")
    except OSError as e:
        debug_log(f"Failed to remove PID file: {e}")


def main() -> int:
    """Main entry point for the hook."""
    debug_log("Session end hook triggered")
    payload = read_hook_input()
    
    # Validate payload
    if payload is None:
        debug_log("No payload received")
        return 0  # Idempotent: no payload means nothing to do
    
    session_id = payload.get("session_id")
    if not session_id:
        debug_log("No session_id in payload")
        return 0  # Idempotent
    
    pid_file = f"/tmp/mgrep-watch-pid-{session_id}.txt"
    
    # Check if PID file exists
    if not os.path.exists(pid_file):
        debug_log(f"PID file not found: {pid_file} (already cleaned up?)")
        return 0  # Idempotent: nothing to clean up
    
    # Read PID from file
    try:
        with open(pid_file, "r") as f:
            pid_str = f.read().strip()
        pid = int(pid_str)
    except (ValueError, OSError) as e:
        debug_log(f"Failed to read PID from file: {e}")
        cleanup_pid_file(pid_file)
        return 0  # Invalid file, just clean up
    
    # Terminate the process
    debug_log(f"Terminating mgrep watch process: {pid}")
    terminated = terminate_process(pid)
    
    if terminated:
        debug_log(f"Successfully terminated process {pid}")
    else:
        debug_log(f"Process {pid} was already terminated or could not be killed")
    
    # Always clean up PID file
    cleanup_pid_file(pid_file)
    
    # Also clean up log file
    log_file = f"/tmp/mgrep-watch-command-{session_id}.log"
    try:
        if os.path.exists(log_file):
            os.remove(log_file)
            debug_log(f"Removed log file: {log_file}")
    except OSError as e:
        debug_log(f"Failed to remove log file: {e}")
    
    return 0


if __name__ == "__main__":
    sys.exit(main())
