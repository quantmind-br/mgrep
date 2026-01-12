import type { ChunkType, FileMetadata, TextChunk } from "../store.js";
import { extname } from "node:path";

export type ContextFormat = "xml" | "markdown" | "plain";

export interface ContextFormatterOptions {
  format?: ContextFormat;
  maxTokens?: number;
  includeMetadata?: boolean;
  query?: string;
}

export interface FormattedContext {
  content: string;
  tokenEstimate: number;
  fileCount: number;
  truncated: boolean;
  chunkCount: number;
}

const EXTENSION_TO_LANGUAGE: Record<string, string> = {
  ".ts": "typescript",
  ".tsx": "tsx",
  ".js": "javascript",
  ".jsx": "jsx",
  ".py": "python",
  ".rb": "ruby",
  ".go": "go",
  ".rs": "rust",
  ".java": "java",
  ".kt": "kotlin",
  ".swift": "swift",
  ".c": "c",
  ".cpp": "cpp",
  ".h": "c",
  ".hpp": "cpp",
  ".cs": "csharp",
  ".php": "php",
  ".sh": "bash",
  ".bash": "bash",
  ".zsh": "zsh",
  ".fish": "fish",
  ".sql": "sql",
  ".json": "json",
  ".yaml": "yaml",
  ".yml": "yaml",
  ".xml": "xml",
  ".html": "html",
  ".css": "css",
  ".scss": "scss",
  ".less": "less",
  ".md": "markdown",
  ".toml": "toml",
  ".ini": "ini",
  ".env": "bash",
  ".dockerfile": "dockerfile",
  ".lua": "lua",
  ".r": "r",
  ".scala": "scala",
  ".clj": "clojure",
  ".ex": "elixir",
  ".exs": "elixir",
  ".erl": "erlang",
  ".hs": "haskell",
  ".vim": "vim",
  ".graphql": "graphql",
  ".proto": "protobuf",
};

export class ContextFormatter {
  private readonly outputFormat: ContextFormat;
  private readonly maxTokens?: number;
  private readonly includeMetadata: boolean;
  private readonly query?: string;

  constructor(options: ContextFormatterOptions = {}) {
    this.outputFormat = options.format ?? "xml";
    this.maxTokens = options.maxTokens;
    this.includeMetadata = options.includeMetadata ?? true;
    this.query = options.query;
  }

  estimateTokens(text: string): number {
    // 4 chars ≈ 1 token, plus 10% formatting overhead
    return Math.ceil((text.length / 4) * 1.1);
  }

  formatResults(chunks: ChunkType[]): FormattedContext {
    const textChunks = chunks.filter(
      (chunk): chunk is TextChunk => chunk.type === "text",
    );

    if (textChunks.length === 0) {
      return {
        content: this.formatEmpty(),
        tokenEstimate: 0,
        fileCount: 0,
        truncated: false,
        chunkCount: 0,
      };
    }

    const uniqueFiles = new Set<string>();
    for (const chunk of textChunks) {
      const path = this.getPath(chunk);
      if (path) uniqueFiles.add(path);
    }

    let formattedChunks: string[];
    let header: string;
    let footer: string;

    switch (this.outputFormat) {
      case "xml":
        formattedChunks = textChunks.map((chunk) => this.formatChunkXml(chunk));
        header = this.getXmlHeader(uniqueFiles.size, textChunks.length);
        footer = this.getXmlFooter();
        break;
      case "markdown":
        formattedChunks = textChunks.map((chunk) =>
          this.formatChunkMarkdown(chunk),
        );
        header = this.getMarkdownHeader(uniqueFiles.size, textChunks.length);
        footer = "";
        break;
      case "plain":
        formattedChunks = textChunks.map((chunk) =>
          this.formatChunkPlain(chunk),
        );
        header = this.getPlainHeader(uniqueFiles.size, textChunks.length);
        footer = "";
        break;
    }

    let truncated = false;
    let includedChunks = formattedChunks;

    if (this.maxTokens) {
      const headerTokens = this.estimateTokens(header);
      const footerTokens = this.estimateTokens(footer);
      let availableTokens = this.maxTokens - headerTokens - footerTokens;

      includedChunks = [];
      for (const chunk of formattedChunks) {
        const chunkTokens = this.estimateTokens(chunk);
        if (chunkTokens <= availableTokens) {
          includedChunks.push(chunk);
          availableTokens -= chunkTokens;
        } else {
          truncated = true;
          break;
        }
      }

      if (truncated) {
        uniqueFiles.clear();
        for (let i = 0; i < includedChunks.length; i++) {
          const path = this.getPath(textChunks[i]);
          if (path) uniqueFiles.add(path);
        }

        switch (this.outputFormat) {
          case "xml":
            header = this.getXmlHeader(
              uniqueFiles.size,
              includedChunks.length,
              truncated,
            );
            break;
          case "markdown":
            header = this.getMarkdownHeader(
              uniqueFiles.size,
              includedChunks.length,
              truncated,
            );
            break;
          case "plain":
            header = this.getPlainHeader(
              uniqueFiles.size,
              includedChunks.length,
              truncated,
            );
            break;
        }
      }
    }

    const content = this.assembleContent(header, includedChunks, footer);

    return {
      content,
      tokenEstimate: this.estimateTokens(content),
      fileCount: uniqueFiles.size,
      truncated,
      chunkCount: includedChunks.length,
    };
  }

  private getPath(chunk: TextChunk): string | undefined {
    const metadata = chunk.metadata as FileMetadata | undefined;
    return metadata?.path;
  }

  private getLineRange(chunk: TextChunk): string {
    const startLine = (chunk.generated_metadata?.start_line ?? 0) + 1;
    const numLines = chunk.generated_metadata?.num_lines ?? 1;
    const endLine = startLine + numLines - 1;
    return `${startLine}-${endLine}`;
  }

  private getLanguage(path: string | undefined): string {
    if (!path) return "";
    const ext = extname(path).toLowerCase();
    return EXTENSION_TO_LANGUAGE[ext] ?? "";
  }

  private escapeXml(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  private formatEmpty(): string {
    switch (this.outputFormat) {
      case "xml":
        return '<context files="0" chunks="0">\n  <!-- No matching results -->\n</context>';
      case "markdown":
        return "# Context\n\n*No matching results*";
      case "plain":
        return "=== No matching results ===";
    }
  }

  private getXmlHeader(
    fileCount: number,
    chunkCount: number,
    truncated = false,
  ): string {
    if (!this.includeMetadata) {
      return "<context>";
    }

    const queryAttr = this.query
      ? ` query="${this.escapeXml(this.query)}"`
      : "";
    const truncatedAttr = truncated ? ' truncated="true"' : "";
    return `<context${queryAttr} files="${fileCount}" chunks="${chunkCount}"${truncatedAttr}>`;
  }

  private getXmlFooter(): string {
    return "</context>";
  }

  private formatChunkXml(chunk: TextChunk): string {
    const path = this.getPath(chunk);
    const lineRange = this.getLineRange(chunk);
    const score = (chunk.score * 100).toFixed(1);

    const pathAttr = path ? ` path="${this.escapeXml(path)}"` : "";
    const lines: string[] = [
      `  <file${pathAttr} lines="${lineRange}" score="${score}%">`,
      chunk.text,
      "  </file>",
    ];

    return lines.join("\n");
  }

  private getMarkdownHeader(
    fileCount: number,
    chunkCount: number,
    truncated = false,
  ): string {
    if (!this.includeMetadata) {
      return "";
    }

    const lines: string[] = [];
    if (this.query) {
      lines.push(`# Context for: ${this.query}`);
    } else {
      lines.push("# Context");
    }
    lines.push("");

    let stats = `Files: ${fileCount} | Chunks: ${chunkCount}`;
    if (truncated) {
      stats += " | *Truncated*";
    }
    lines.push(stats);
    lines.push("");

    return lines.join("\n");
  }

  private formatChunkMarkdown(chunk: TextChunk): string {
    const path = this.getPath(chunk);
    const lineRange = this.getLineRange(chunk);
    const score = (chunk.score * 100).toFixed(1);
    const language = this.getLanguage(path);

    const lines: string[] = [];
    const pathDisplay = path ?? "unknown";
    lines.push(`## ${pathDisplay} (lines ${lineRange}) - ${score}% match`);
    lines.push("");
    lines.push(`\`\`\`${language}`);
    lines.push(chunk.text);
    lines.push("```");
    lines.push("");

    return lines.join("\n");
  }

  private getPlainHeader(
    fileCount: number,
    chunkCount: number,
    truncated = false,
  ): string {
    if (!this.includeMetadata) {
      return "";
    }

    let stats = `[${fileCount} files, ${chunkCount} chunks]`;
    if (this.query) {
      stats = `[Query: ${this.query}] ${stats}`;
    }
    if (truncated) {
      stats += " [TRUNCATED]";
    }
    return `${stats}\n\n`;
  }

  private formatChunkPlain(chunk: TextChunk): string {
    const path = this.getPath(chunk) ?? "unknown";
    const lineRange = this.getLineRange(chunk);
    const score = (chunk.score * 100).toFixed(1);

    const lines: string[] = [
      `=== ${path}:${lineRange} (${score}%) ===`,
      chunk.text,
      "",
    ];

    return lines.join("\n");
  }

  private assembleContent(
    header: string,
    chunks: string[],
    footer: string,
  ): string {
    const parts: string[] = [];

    if (header) {
      parts.push(header);
    }

    parts.push(chunks.join("\n"));

    if (footer) {
      parts.push(footer);
    }

    return parts.join("\n");
  }
}
