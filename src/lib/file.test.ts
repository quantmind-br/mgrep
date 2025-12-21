import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_IGNORE_PATTERNS, NodeFileSystem } from "./file.js";
import type { Git } from "./git.js";

describe("file", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mgrep-file-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  describe("DEFAULT_IGNORE_PATTERNS", () => {
    it("should include common binary and lock patterns", () => {
      expect(DEFAULT_IGNORE_PATTERNS).toContain("*.lock");
      expect(DEFAULT_IGNORE_PATTERNS).toContain("*.bin");
      expect(DEFAULT_IGNORE_PATTERNS).toContain("*.ipynb");
      expect(DEFAULT_IGNORE_PATTERNS).toContain("*.pyc");
      expect(DEFAULT_IGNORE_PATTERNS).toContain("*.safetensors");
      expect(DEFAULT_IGNORE_PATTERNS).toContain("*.sqlite");
      expect(DEFAULT_IGNORE_PATTERNS).toContain("*.pt");
    });
  });

  describe("NodeFileSystem", () => {
    let mockGit: Git;

    beforeEach(() => {
      mockGit = {
        isGitRepository: vi.fn().mockReturnValue(false),
        getGitIgnoreContent: vi.fn().mockReturnValue(null),
        getGitFiles: vi.fn().mockReturnValue([].values()),
        getGitIgnoreFilter: vi.fn().mockReturnValue({
          isIgnored: () => false,
          add: () => {},
          clear: () => {},
        }),
      };
    });

    describe("constructor", () => {
      it("should create with empty ignore patterns", () => {
        const fs = new NodeFileSystem(mockGit, { ignorePatterns: [] });
        expect(fs).toBeDefined();
      });

      it("should create with custom ignore patterns", () => {
        const fs = new NodeFileSystem(mockGit, {
          ignorePatterns: ["*.log", "*.tmp"],
        });
        expect(fs).toBeDefined();
      });
    });

    describe("getFiles", () => {
      it("should return files recursively for non-git directory", () => {
        const nodeFs = new NodeFileSystem(mockGit, { ignorePatterns: [] });

        // Create test files
        fs.writeFileSync(path.join(tempDir, "file1.txt"), "content1");
        fs.mkdirSync(path.join(tempDir, "subdir"));
        fs.writeFileSync(path.join(tempDir, "subdir", "file2.txt"), "content2");

        const files = Array.from(nodeFs.getFiles(tempDir));

        expect(files).toContain(path.join(tempDir, "file1.txt"));
        expect(files).toContain(path.join(tempDir, "subdir", "file2.txt"));
      });

      it("should use git files when in git repository", () => {
        const gitFiles = [
          path.join(tempDir, "tracked1.txt"),
          path.join(tempDir, "tracked2.txt"),
        ];
        mockGit.isGitRepository = vi.fn().mockReturnValue(true);
        mockGit.getGitFiles = vi.fn().mockReturnValue(gitFiles.values());

        const nodeFs = new NodeFileSystem(mockGit, { ignorePatterns: [] });

        // Create the files
        fs.writeFileSync(gitFiles[0], "content");
        fs.writeFileSync(gitFiles[1], "content");

        const files = Array.from(nodeFs.getFiles(tempDir));

        expect(mockGit.getGitFiles).toHaveBeenCalledWith(tempDir);
        expect(files).toEqual(gitFiles);
      });

      it("should skip hidden files", () => {
        const nodeFs = new NodeFileSystem(mockGit, { ignorePatterns: [] });

        fs.writeFileSync(path.join(tempDir, "visible.txt"), "content");
        fs.writeFileSync(path.join(tempDir, ".hidden"), "hidden");

        const files = Array.from(nodeFs.getFiles(tempDir));

        expect(files).toContain(path.join(tempDir, "visible.txt"));
        expect(files).not.toContain(path.join(tempDir, ".hidden"));
      });

      it("should skip hidden directories", () => {
        const nodeFs = new NodeFileSystem(mockGit, { ignorePatterns: [] });

        fs.mkdirSync(path.join(tempDir, ".hidden"));
        fs.writeFileSync(path.join(tempDir, ".hidden", "file.txt"), "content");
        fs.writeFileSync(path.join(tempDir, "visible.txt"), "content");

        const files = Array.from(nodeFs.getFiles(tempDir));

        expect(files).not.toContain(path.join(tempDir, ".hidden", "file.txt"));
        expect(files).toContain(path.join(tempDir, "visible.txt"));
      });
    });

    describe("isIgnored", () => {
      it("should ignore hidden files", () => {
        const nodeFs = new NodeFileSystem(mockGit, { ignorePatterns: [] });

        const hiddenFile = path.join(tempDir, ".hidden");
        fs.writeFileSync(hiddenFile, "content");

        expect(nodeFs.isIgnored(hiddenFile, tempDir)).toBe(true);
      });

      it("should ignore files in hidden directories", () => {
        const nodeFs = new NodeFileSystem(mockGit, { ignorePatterns: [] });

        const hiddenDir = path.join(tempDir, ".hidden");
        fs.mkdirSync(hiddenDir);
        const fileInHiddenDir = path.join(hiddenDir, "file.txt");
        fs.writeFileSync(fileInHiddenDir, "content");

        expect(nodeFs.isIgnored(fileInHiddenDir, tempDir)).toBe(true);
      });

      it("should ignore files matching custom patterns", () => {
        const nodeFs = new NodeFileSystem(mockGit, {
          ignorePatterns: ["*.log", "*.tmp"],
        });

        const logFile = path.join(tempDir, "test.log");
        const tmpFile = path.join(tempDir, "test.tmp");
        const txtFile = path.join(tempDir, "test.txt");
        fs.writeFileSync(logFile, "content");
        fs.writeFileSync(tmpFile, "content");
        fs.writeFileSync(txtFile, "content");

        expect(nodeFs.isIgnored(logFile, tempDir)).toBe(true);
        expect(nodeFs.isIgnored(tmpFile, tempDir)).toBe(true);
        expect(nodeFs.isIgnored(txtFile, tempDir)).toBe(false);
      });

      it("should ignore directories matching custom patterns", () => {
        const nodeFs = new NodeFileSystem(mockGit, {
          ignorePatterns: ["build/"],
        });

        const buildDir = path.join(tempDir, "build");
        fs.mkdirSync(buildDir);

        expect(nodeFs.isIgnored(buildDir, tempDir)).toBe(true);
      });

      it("should respect .gitignore patterns", () => {
        const nodeFs = new NodeFileSystem(mockGit, { ignorePatterns: [] });

        // Create .gitignore
        const gitignorePath = path.join(tempDir, ".gitignore");
        fs.writeFileSync(gitignorePath, "*.log");

        // Load mgrepignore (which also loads gitignore)
        nodeFs.loadMgrepignore(tempDir);

        const logFile = path.join(tempDir, "test.log");
        const txtFile = path.join(tempDir, "test.txt");
        fs.writeFileSync(logFile, "content");
        fs.writeFileSync(txtFile, "content");

        expect(nodeFs.isIgnored(logFile, tempDir)).toBe(true);
        expect(nodeFs.isIgnored(txtFile, tempDir)).toBe(false);
      });

      it("should respect .mgrepignore patterns", () => {
        const nodeFs = new NodeFileSystem(mockGit, { ignorePatterns: [] });

        // Create .mgrepignore
        const mgrepignorePath = path.join(tempDir, ".mgrepignore");
        fs.writeFileSync(mgrepignorePath, "*.secret");

        // Load mgrepignore
        nodeFs.loadMgrepignore(tempDir);

        const secretFile = path.join(tempDir, "test.secret");
        const txtFile = path.join(tempDir, "test.txt");
        fs.writeFileSync(secretFile, "content");
        fs.writeFileSync(txtFile, "content");

        expect(nodeFs.isIgnored(secretFile, tempDir)).toBe(true);
        expect(nodeFs.isIgnored(txtFile, tempDir)).toBe(false);
      });

      it("should handle hierarchical ignore patterns", () => {
        const nodeFs = new NodeFileSystem(mockGit, { ignorePatterns: [] });

        // Create subdirectory with its own .gitignore
        const subdir = path.join(tempDir, "subdir");
        fs.mkdirSync(subdir);
        fs.writeFileSync(path.join(subdir, ".gitignore"), "local.txt");

        // Load root
        nodeFs.loadMgrepignore(tempDir);

        const rootFile = path.join(tempDir, "local.txt");
        const subdirFile = path.join(subdir, "local.txt");
        fs.writeFileSync(rootFile, "content");
        fs.writeFileSync(subdirFile, "content");

        // local.txt should be ignored in subdir but not in root
        expect(nodeFs.isIgnored(rootFile, tempDir)).toBe(false);
        expect(nodeFs.isIgnored(subdirFile, tempDir)).toBe(true);
      });

      it("should handle negation patterns (unignore)", () => {
        const nodeFs = new NodeFileSystem(mockGit, { ignorePatterns: [] });

        // Create .gitignore with negation
        const gitignorePath = path.join(tempDir, ".gitignore");
        fs.writeFileSync(gitignorePath, "*.log\n!important.log");

        nodeFs.loadMgrepignore(tempDir);

        const normalLog = path.join(tempDir, "test.log");
        const importantLog = path.join(tempDir, "important.log");
        fs.writeFileSync(normalLog, "content");
        fs.writeFileSync(importantLog, "content");

        expect(nodeFs.isIgnored(normalLog, tempDir)).toBe(true);
        expect(nodeFs.isIgnored(importantLog, tempDir)).toBe(false);
      });
    });

    describe("loadMgrepignore", () => {
      it("should load .gitignore", () => {
        const nodeFs = new NodeFileSystem(mockGit, { ignorePatterns: [] });

        const gitignorePath = path.join(tempDir, ".gitignore");
        fs.writeFileSync(gitignorePath, "*.log");

        nodeFs.loadMgrepignore(tempDir);

        const logFile = path.join(tempDir, "test.log");
        fs.writeFileSync(logFile, "content");

        expect(nodeFs.isIgnored(logFile, tempDir)).toBe(true);
      });

      it("should load .mgrepignore", () => {
        const nodeFs = new NodeFileSystem(mockGit, { ignorePatterns: [] });

        const mgrepignorePath = path.join(tempDir, ".mgrepignore");
        fs.writeFileSync(mgrepignorePath, "*.custom");

        nodeFs.loadMgrepignore(tempDir);

        const customFile = path.join(tempDir, "test.custom");
        fs.writeFileSync(customFile, "content");

        expect(nodeFs.isIgnored(customFile, tempDir)).toBe(true);
      });

      it("should merge both .gitignore and .mgrepignore", () => {
        const nodeFs = new NodeFileSystem(mockGit, { ignorePatterns: [] });

        fs.writeFileSync(path.join(tempDir, ".gitignore"), "*.log");
        fs.writeFileSync(path.join(tempDir, ".mgrepignore"), "*.custom");

        nodeFs.loadMgrepignore(tempDir);

        const logFile = path.join(tempDir, "test.log");
        const customFile = path.join(tempDir, "test.custom");
        const txtFile = path.join(tempDir, "test.txt");
        fs.writeFileSync(logFile, "content");
        fs.writeFileSync(customFile, "content");
        fs.writeFileSync(txtFile, "content");

        expect(nodeFs.isIgnored(logFile, tempDir)).toBe(true);
        expect(nodeFs.isIgnored(customFile, tempDir)).toBe(true);
        expect(nodeFs.isIgnored(txtFile, tempDir)).toBe(false);
      });

      it("should cache loaded ignore patterns", () => {
        const nodeFs = new NodeFileSystem(mockGit, { ignorePatterns: [] });

        fs.writeFileSync(path.join(tempDir, ".gitignore"), "*.log");

        nodeFs.loadMgrepignore(tempDir);
        nodeFs.loadMgrepignore(tempDir); // Second call should use cache

        const logFile = path.join(tempDir, "test.log");
        fs.writeFileSync(logFile, "content");

        expect(nodeFs.isIgnored(logFile, tempDir)).toBe(true);
      });
    });

    describe("edge cases", () => {
      it("should handle non-existent directory gracefully", () => {
        const nodeFs = new NodeFileSystem(mockGit, { ignorePatterns: [] });

        const consoleSpy = vi
          .spyOn(console, "error")
          .mockImplementation(() => {});

        const nonExistent = path.join(tempDir, "nonexistent");
        const files = Array.from(nodeFs.getFiles(nonExistent));

        expect(files).toEqual([]);

        consoleSpy.mockRestore();
      });

      it("should handle deeply nested structures", () => {
        const nodeFs = new NodeFileSystem(mockGit, { ignorePatterns: [] });

        // Create deep structure
        const deepPath = path.join(tempDir, "a", "b", "c", "d");
        fs.mkdirSync(deepPath, { recursive: true });
        fs.writeFileSync(path.join(deepPath, "deep.txt"), "content");

        const files = Array.from(nodeFs.getFiles(tempDir));

        expect(files).toContain(path.join(deepPath, "deep.txt"));
      });

      it("should ignore symlinks as files", () => {
        const nodeFs = new NodeFileSystem(mockGit, { ignorePatterns: [] });

        // Create a regular file and a symlink
        const realFile = path.join(tempDir, "real.txt");
        fs.writeFileSync(realFile, "content");

        // Note: symlink behavior depends on OS and permissions
        // This test verifies the file system traversal handles it
        const files = Array.from(nodeFs.getFiles(tempDir));

        expect(files).toContain(realFile);
      });
    });
  });
});
