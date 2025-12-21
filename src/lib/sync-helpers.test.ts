import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createIndexingSpinner,
  formatDryRunSummary,
  type InitialSyncProgress,
  type InitialSyncResult,
} from "./sync-helpers.js";

// Mock ora
vi.mock("ora", () => ({
  default: vi.fn(() => ({
    start: vi.fn().mockReturnThis(),
    stop: vi.fn().mockReturnThis(),
    succeed: vi.fn().mockReturnThis(),
    fail: vi.fn().mockReturnThis(),
    warn: vi.fn().mockReturnThis(),
    text: "",
  })),
}));

describe("sync-helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("formatDryRunSummary", () => {
    it("should format basic dry run summary", () => {
      const result: InitialSyncResult = {
        processed: 10,
        uploaded: 5,
        deleted: 0,
        errors: 0,
        total: 10,
      };

      const summary = formatDryRunSummary(result, {
        actionDescription: "would have indexed",
      });

      expect(summary).toBe(
        "Dry run: would have indexed 10 files, would have uploaded 5 changed or new files",
      );
    });

    it("should include total suffix when includeTotal is true", () => {
      const result: InitialSyncResult = {
        processed: 10,
        uploaded: 5,
        deleted: 0,
        errors: 0,
        total: 10,
      };

      const summary = formatDryRunSummary(result, {
        actionDescription: "found",
        includeTotal: true,
      });

      expect(summary).toBe(
        "Dry run: found 10 files in total, would have uploaded 5 changed or new files",
      );
    });

    it("should include deleted count when > 0", () => {
      const result: InitialSyncResult = {
        processed: 10,
        uploaded: 5,
        deleted: 3,
        errors: 0,
        total: 10,
      };

      const summary = formatDryRunSummary(result, {
        actionDescription: "would have indexed",
      });

      expect(summary).toBe(
        "Dry run: would have indexed 10 files, would have uploaded 5 changed or new files, would have deleted 3 files",
      );
    });

    it("should handle zero uploaded files", () => {
      const result: InitialSyncResult = {
        processed: 5,
        uploaded: 0,
        deleted: 0,
        errors: 0,
        total: 5,
      };

      const summary = formatDryRunSummary(result, {
        actionDescription: "scanned",
      });

      expect(summary).toBe(
        "Dry run: scanned 5 files, would have uploaded 0 changed or new files",
      );
    });

    it("should handle all options combined", () => {
      const result: InitialSyncResult = {
        processed: 100,
        uploaded: 25,
        deleted: 10,
        errors: 2,
        total: 100,
      };

      const summary = formatDryRunSummary(result, {
        actionDescription: "processed",
        includeTotal: true,
      });

      expect(summary).toContain("processed 100 files in total");
      expect(summary).toContain("would have uploaded 25");
      expect(summary).toContain("would have deleted 10 files");
    });
  });

  describe("createIndexingSpinner", () => {
    it("should create spinner with default label", () => {
      const { spinner, onProgress } =
        createIndexingSpinner("/home/user/project");

      expect(spinner).toBeDefined();
      expect(onProgress).toBeInstanceOf(Function);
    });

    it("should create spinner with custom label", () => {
      const { spinner, onProgress } = createIndexingSpinner(
        "/home/user/project",
        "Custom label...",
      );

      expect(spinner).toBeDefined();
      expect(onProgress).toBeInstanceOf(Function);
    });

    it("should update spinner text on progress", () => {
      const { spinner, onProgress } =
        createIndexingSpinner("/home/user/project");

      const progress: InitialSyncProgress = {
        processed: 5,
        uploaded: 3,
        deleted: 0,
        errors: 0,
        total: 10,
        filePath: "/home/user/project/src/file.ts",
      };

      onProgress(progress);

      // Spinner text should be updated with relative path
      expect(spinner.text).toContain("Indexing files");
      expect(spinner.text).toContain("5/10");
      expect(spinner.text).toContain("uploaded 3");
      expect(spinner.text).toContain("src/file.ts");
    });

    it("should show deleted count in spinner text when > 0", () => {
      const { spinner, onProgress } =
        createIndexingSpinner("/home/user/project");

      const progress: InitialSyncProgress = {
        processed: 5,
        uploaded: 3,
        deleted: 2,
        errors: 0,
        total: 10,
      };

      onProgress(progress);

      expect(spinner.text).toContain("deleted 2");
    });

    it("should show errors count in spinner text when > 0", () => {
      const { spinner, onProgress } =
        createIndexingSpinner("/home/user/project");

      const progress: InitialSyncProgress = {
        processed: 5,
        uploaded: 3,
        deleted: 0,
        errors: 1,
        total: 10,
      };

      onProgress(progress);

      expect(spinner.text).toContain("errors 1");
    });

    it("should handle file path outside root", () => {
      const { spinner, onProgress } =
        createIndexingSpinner("/home/user/project");

      const progress: InitialSyncProgress = {
        processed: 1,
        uploaded: 1,
        deleted: 0,
        errors: 0,
        total: 1,
        filePath: "/other/path/file.txt",
      };

      onProgress(progress);

      // When file is outside root, it should show absolute path
      expect(spinner.text).toContain("/other/path/file.txt");
    });

    it("should handle progress without filePath", () => {
      const { spinner, onProgress } =
        createIndexingSpinner("/home/user/project");

      const progress: InitialSyncProgress = {
        processed: 5,
        uploaded: 3,
        deleted: 0,
        errors: 0,
        total: 10,
      };

      onProgress(progress);

      // Should not throw and should update text
      expect(spinner.text).toContain("5/10");
      expect(spinner.text).toContain("uploaded 3");
    });

    it("should format relative path correctly", () => {
      const { spinner, onProgress } =
        createIndexingSpinner("/home/user/project");

      const progress: InitialSyncProgress = {
        processed: 1,
        uploaded: 1,
        deleted: 0,
        errors: 0,
        total: 1,
        filePath: "/home/user/project/deep/nested/file.ts",
      };

      onProgress(progress);

      expect(spinner.text).toContain("deep/nested/file.ts");
    });
  });
});
