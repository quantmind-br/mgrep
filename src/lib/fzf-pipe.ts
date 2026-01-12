import { exec, spawn } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

export interface FzfResult {
  selected: boolean;
  filePath: string;
  lineNumber: number;
}

export interface SearchResultForFzf {
  path: string;
  startLine: number;
  endLine: number;
  score: number;
  preview: string;
}

export class FzfPipe {
  static async isAvailable(): Promise<boolean> {
    try {
      await execAsync("which fzf");
      return true;
    } catch {
      return false;
    }
  }

  formatResults(results: SearchResultForFzf[]): string[] {
    return results.map((r) => {
      const scorePercent = (r.score * 100).toFixed(1);
      const previewTruncated = r.preview.slice(0, 80).replace(/\n/g, " ");
      return `${r.path}:${r.startLine}-${r.endLine} (${scorePercent}%) | ${previewTruncated}`;
    });
  }

  async selectWithFzf(
    results: SearchResultForFzf[],
  ): Promise<FzfResult | null> {
    const lines = this.formatResults(results);

    return new Promise((resolve, reject) => {
      const fzf = spawn(
        "fzf",
        [
          "--ansi",
          "--preview-window",
          "right:50%",
          "--preview",
          "cat {1} 2>/dev/null | head -100",
          "--delimiter",
          ":",
          "--nth",
          "1,2",
        ],
        {
          stdio: ["pipe", "pipe", "inherit"],
        },
      );

      const input = lines.join("\n");
      fzf.stdin.write(input);
      fzf.stdin.end();

      let output = "";
      fzf.stdout.on("data", (data) => {
        output += data.toString();
      });

      fzf.on("close", (code) => {
        if (code === 0 && output.trim()) {
          const match = output.match(/^([^:]+):(\d+)-/);
          if (match) {
            resolve({
              selected: true,
              filePath: match[1],
              lineNumber: Number.parseInt(match[2], 10),
            });
            return;
          }
        }
        resolve(null);
      });

      fzf.on("error", (err) => {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") {
          resolve(null);
        } else {
          reject(err);
        }
      });
    });
  }

  async openInEditor(filePath: string, line: number): Promise<void> {
    const editor = process.env.EDITOR || process.env.VISUAL || "vi";
    const editorLower = editor.toLowerCase();

    let args: string[];

    if (editorLower.includes("code")) {
      args = ["-g", `${filePath}:${line}`];
    } else if (
      editorLower.includes("subl") ||
      editorLower.includes("sublime")
    ) {
      args = [`${filePath}:${line}`];
    } else {
      args = [`+${line}`, filePath];
    }

    return new Promise((resolve, reject) => {
      const proc = spawn(editor, args, {
        stdio: "inherit",
        detached: false,
      });

      proc.on("close", () => resolve());
      proc.on("error", reject);
    });
  }
}
