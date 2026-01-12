import * as p from "@clack/prompts";
import type { SearchResultForFzf } from "./fzf-pipe.js";

export type NativeSelectResult = {
  selected: boolean;
  filePath: string;
  lineNumber: number;
};

export async function nativeSelect(
  results: SearchResultForFzf[],
  limit = 20,
): Promise<NativeSelectResult | null> {
  const choices = results.slice(0, limit).map((result) => {
    const scorePercent = (result.score * 100).toFixed(1);
    const previewTruncated = result.preview.slice(0, 80).replace(/\n/g, " ");
    return {
      value: result,
      label: `${result.path}:${result.startLine}-${result.endLine}`,
      hint: `${scorePercent}% ${previewTruncated}`,
    };
  });

  if (choices.length === 0) {
    return null;
  }

  const selected = await p.select({
    message: "Select a result to open:",
    options: choices,
  });

  if (p.isCancel(selected)) {
    p.cancel("Selection cancelled.");
    return null;
  }

  return {
    selected: true,
    filePath: selected.path,
    lineNumber: selected.startLine,
  };
}
