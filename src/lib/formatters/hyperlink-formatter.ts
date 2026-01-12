import { resolve } from "node:path";

export class HyperlinkFormatter {
  private readonly enabled: boolean;

  constructor(enabled?: boolean) {
    this.enabled = enabled ?? this.detectSupport();
  }

  private detectSupport(): boolean {
    if (!process.stdout.isTTY) {
      return false;
    }

    const termProgram = process.env.TERM_PROGRAM ?? "";
    const wtSession = process.env.WT_SESSION;
    const gnomeTerminal = process.env.GNOME_TERMINAL_SCREEN;
    const colorterm = process.env.COLORTERM;
    const term = process.env.TERM ?? "";

    if (termProgram === "iTerm.app") return true;
    if (termProgram === "WezTerm") return true;
    if (termProgram === "vscode") return true;
    if (termProgram === "Hyper") return true;
    if (wtSession) return true;
    if (gnomeTerminal) return true;
    if (colorterm === "truecolor" && term.includes("256color")) return true;

    return false;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  createLink(url: string, text: string): string {
    if (!this.enabled) {
      return text;
    }

    const OSC = "\u001B]";
    const BEL = "\u0007";
    const ST = "\u001B\\";

    return `${OSC}8;;${url}${BEL}${text}${OSC}8;;${ST}`;
  }

  formatFilePath(
    filePath: string,
    startLine: number,
    endLine: number,
    cwd?: string,
  ): string {
    const displayText = `${filePath}:${startLine}-${endLine}`;

    if (!this.enabled) {
      return displayText;
    }

    const absolutePath = filePath.startsWith("/")
      ? filePath
      : resolve(cwd ?? process.cwd(), filePath);

    const fileUrl = `file://${absolutePath}#${startLine}`;

    return this.createLink(fileUrl, displayText);
  }

  formatPathWithScore(
    filePath: string,
    startLine: number,
    endLine: number,
    score: number,
    cwd?: string,
  ): string {
    const linkedPath = this.formatFilePath(filePath, startLine, endLine, cwd);
    const scorePercent = (score * 100).toFixed(2);
    return `.${linkedPath} (${scorePercent}% match)`;
  }
}
