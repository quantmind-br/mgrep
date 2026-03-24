import type {
  AskResponse,
  ChunkType,
  FileMetadata,
  SearchResponse,
  TextChunk,
} from "../store.js";

function isUrlResult(
  chunk: ChunkType,
): chunk is TextChunk & { filename: string } {
  return (
    chunk.type === "text" &&
    "filename" in chunk &&
    typeof chunk.filename === "string" &&
    chunk.filename.startsWith("http")
  );
}

export function extractSources(response: AskResponse): {
  [key: number]: ChunkType;
} {
  const sources: { [key: number]: ChunkType } = {};
  const answer = response.answer;
  const citeTags = answer.match(/<cite i="(\d+(?:-\d+)?)"/g) ?? [];

  for (const tag of citeTags) {
    const index = tag.match(/i="(\d+(?:-\d+)?)"/)?.[1];
    if (!index) continue;

    if (!index.includes("-")) {
      const idx = Number(index);
      if (!Number.isNaN(idx) && idx < response.sources.length) {
        sources[idx] = response.sources[idx];
      }
      continue;
    }

    const [start, end] = index.split("-").map(Number);

    if (
      !Number.isNaN(start) &&
      !Number.isNaN(end) &&
      start >= 0 &&
      end >= start &&
      end < response.sources.length
    ) {
      for (let i = start; i <= end; i++) {
        sources[i] = response.sources[i];
      }
    }
  }

  return sources;
}

export function formatAskResponse(
  response: AskResponse,
  showContent: boolean,
): string {
  const sources = extractSources(response);
  const sourceEntries = Object.entries(sources).map(
    ([index, chunk]) => `${index}: ${formatChunk(chunk, showContent)}`,
  );
  return `${response.answer}\n\n${sourceEntries.join("\n")}`;
}

export function formatSearchResponse(
  response: SearchResponse,
  showContent: boolean,
): string {
  return response.data
    .map((chunk) => formatChunk(chunk, showContent))
    .join("\n");
}

export function formatChunk(chunk: ChunkType, showContent: boolean): string {
  const pwd = process.cwd();

  if (isUrlResult(chunk)) {
    const url = chunk.filename;
    const content = showContent ? chunk.text : "";
    return `${url} (${(chunk.score * 100).toFixed(2)}% match)${content ? `\n${content}` : ""}`;
  }

  const path =
    (chunk.metadata as FileMetadata)?.path?.replace(pwd, "") ?? "Unknown path";
  let lineRange = "";
  let content = "";

  switch (chunk.type) {
    case "text": {
      const startLine = (chunk.generated_metadata?.start_line ?? 0) + 1;
      const endLine = startLine + (chunk.generated_metadata?.num_lines ?? 0);
      lineRange = `:${startLine}-${endLine}`;
      content = showContent ? chunk.text : "";
      break;
    }
    case "image_url":
      lineRange =
        chunk.generated_metadata?.type === "pdf"
          ? `, page ${chunk.chunk_index + 1}`
          : "";
      break;
    case "audio_url":
      lineRange = "";
      break;
    case "video_url":
      lineRange = "";
      break;
  }

  return `.${path}${lineRange} (${(chunk.score * 100).toFixed(2)}% match)${content ? `\n${content}` : ""}`;
}
