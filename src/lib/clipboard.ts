import { spawn } from "node:child_process";

export interface ClipboardResult {
  success: boolean;
  error?: string;
}

function spawnWithInput(
  command: string,
  args: string[],
  input: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, { stdio: ["pipe", "ignore", "ignore"] });

    proc.stdin.write(input);
    proc.stdin.end();

    proc.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} exited with code ${code}`));
      }
    });

    proc.on("error", reject);
  });
}

async function tryClipboardTools(text: string): Promise<void> {
  const linuxTools = [
    { cmd: "xclip", args: ["-selection", "clipboard"] },
    { cmd: "xsel", args: ["--clipboard", "--input"] },
    { cmd: "wl-copy", args: [] },
  ];

  for (const { cmd, args } of linuxTools) {
    try {
      await spawnWithInput(cmd, args, text);
      return;
    } catch {}
  }

  throw new Error("No clipboard tool found. Install xclip, xsel, or wl-copy.");
}

export async function copyToClipboard(text: string): Promise<ClipboardResult> {
  const platform = process.platform;

  try {
    if (platform === "darwin") {
      await spawnWithInput("pbcopy", [], text);
    } else if (platform === "win32") {
      await spawnWithInput("clip", [], text);
    } else {
      await tryClipboardTools(text);
    }
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: message };
  }
}

export function isClipboardAvailable(): boolean {
  const platform = process.platform;
  return platform === "darwin" || platform === "win32" || platform === "linux";
}
