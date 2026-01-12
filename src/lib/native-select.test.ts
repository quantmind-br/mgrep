import { describe, expect, it, vi } from "vitest";
import { nativeSelect } from "./native-select.js";

vi.mock("@clack/prompts", () => ({
  select: vi.fn(),
  isCancel: vi.fn(),
  cancel: vi.fn(),
}));

const baseResults = [
  {
    path: "/tmp/file.ts",
    startLine: 10,
    endLine: 12,
    score: 0.9,
    preview: "const value = 1;\n",
  },
];

describe("nativeSelect", () => {
  it("returns null when there are no choices", async () => {
    const result = await nativeSelect([]);
    expect(result).toBeNull();
  });

  it("returns selection when user chooses", async () => {
    const prompts = await import("@clack/prompts");
    vi.mocked(prompts.select).mockResolvedValue(baseResults[0]);
    vi.mocked(prompts.isCancel).mockReturnValue(false);

    const result = await nativeSelect(baseResults);
    expect(result).toEqual({
      selected: true,
      filePath: "/tmp/file.ts",
      lineNumber: 10,
    });
  });

  it("returns null on cancel", async () => {
    const prompts = await import("@clack/prompts");
    vi.mocked(prompts.select).mockResolvedValue(baseResults[0]);
    vi.mocked(prompts.isCancel).mockReturnValue(true);

    const result = await nativeSelect(baseResults);
    expect(result).toBeNull();
    expect(vi.mocked(prompts.cancel)).toHaveBeenCalled();
  });
});
