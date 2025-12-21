import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GitIgnoreFilter, NodeGit } from "./git.js";

describe("git", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mgrep-git-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  describe("GitIgnoreFilter", () => {
    it("should create empty filter without content", () => {
      const filter = new GitIgnoreFilter();
      expect(filter).toBeDefined();
    });

    it("should create filter with initial content", () => {
      const filter = new GitIgnoreFilter("*.log\nnode_modules/");
      expect(filter).toBeDefined();
    });

    it("should ignore files matching patterns", () => {
      const filter = new GitIgnoreFilter("*.log\n*.tmp");

      // Create test file
      const logFile = path.join(tempDir, "test.log");
      fs.writeFileSync(logFile, "log content");

      expect(filter.isIgnored(logFile, tempDir)).toBe(true);
    });

    it("should not ignore files not matching patterns", () => {
      const filter = new GitIgnoreFilter("*.log");

      const txtFile = path.join(tempDir, "test.txt");
      fs.writeFileSync(txtFile, "text content");

      expect(filter.isIgnored(txtFile, tempDir)).toBe(false);
    });

    it("should ignore directories matching patterns", () => {
      const filter = new GitIgnoreFilter("node_modules/");

      const nodeModules = path.join(tempDir, "node_modules");
      fs.mkdirSync(nodeModules);

      expect(filter.isIgnored(nodeModules, tempDir)).toBe(true);
    });

    it("should add patterns dynamically", () => {
      const filter = new GitIgnoreFilter();

      const logFile = path.join(tempDir, "test.log");
      fs.writeFileSync(logFile, "log content");

      expect(filter.isIgnored(logFile, tempDir)).toBe(false);

      filter.add("*.log");

      expect(filter.isIgnored(logFile, tempDir)).toBe(true);
    });

    it("should clear all patterns", () => {
      const filter = new GitIgnoreFilter("*.log");

      const logFile = path.join(tempDir, "test.log");
      fs.writeFileSync(logFile, "log content");

      expect(filter.isIgnored(logFile, tempDir)).toBe(true);

      filter.clear();

      expect(filter.isIgnored(logFile, tempDir)).toBe(false);
    });

    it("should handle negation patterns", () => {
      const filter = new GitIgnoreFilter("*.log\n!important.log");

      const logFile = path.join(tempDir, "test.log");
      const importantFile = path.join(tempDir, "important.log");
      fs.writeFileSync(logFile, "log content");
      fs.writeFileSync(importantFile, "important content");

      expect(filter.isIgnored(logFile, tempDir)).toBe(true);
      expect(filter.isIgnored(importantFile, tempDir)).toBe(false);
    });

    it("should handle nested paths", () => {
      const filter = new GitIgnoreFilter("build/");

      const buildDir = path.join(tempDir, "src", "build");
      fs.mkdirSync(buildDir, { recursive: true });

      expect(filter.isIgnored(buildDir, tempDir)).toBe(true);
    });

    it("should not ignore root directory itself", () => {
      const filter = new GitIgnoreFilter("*");

      expect(filter.isIgnored(tempDir, tempDir)).toBe(false);
    });

    it("should handle non-existent files", () => {
      const filter = new GitIgnoreFilter("*.log");

      const nonExistent = path.join(tempDir, "nonexistent.log");

      expect(filter.isIgnored(nonExistent, tempDir)).toBe(true);
    });
  });

  describe("NodeGit", () => {
    let git: NodeGit;

    beforeEach(() => {
      git = new NodeGit();
    });

    describe("isGitRepository", () => {
      it("should return false for non-git directory", () => {
        expect(git.isGitRepository(tempDir)).toBe(false);
      });

      it("should return true for git directory", () => {
        // Initialize git repo
        const { spawnSync } = require("node:child_process");
        spawnSync("git", ["init"], { cwd: tempDir });

        expect(git.isGitRepository(tempDir)).toBe(true);
      });

      it("should cache results", () => {
        // First call
        const result1 = git.isGitRepository(tempDir);
        // Second call should use cache
        const result2 = git.isGitRepository(tempDir);

        expect(result1).toBe(result2);
      });
    });

    describe("getGitIgnoreContent", () => {
      it("should return null when no .gitignore exists", () => {
        const content = git.getGitIgnoreContent(tempDir);
        expect(content).toBeNull();
      });

      it("should return .gitignore content", () => {
        const gitignorePath = path.join(tempDir, ".gitignore");
        fs.writeFileSync(gitignorePath, "*.log\nnode_modules/");

        const content = git.getGitIgnoreContent(tempDir);

        expect(content).toBe("*.log\nnode_modules/");
      });

      it("should handle read errors gracefully", () => {
        // Create a directory named .gitignore (can't read as file)
        const gitignorePath = path.join(tempDir, ".gitignore");
        fs.mkdirSync(gitignorePath);

        const consoleSpy = vi
          .spyOn(console, "error")
          .mockImplementation(() => {});

        const content = git.getGitIgnoreContent(tempDir);

        expect(content).toBeNull();
        expect(consoleSpy).toHaveBeenCalled();

        consoleSpy.mockRestore();
      });
    });

    describe("getGitFiles", () => {
      it("should return empty generator for non-git directory", () => {
        const files = Array.from(git.getGitFiles(tempDir));
        expect(files).toEqual([]);
      });

      it("should return tracked and untracked files", () => {
        // Initialize git repo
        const { spawnSync } = require("node:child_process");
        spawnSync("git", ["init"], { cwd: tempDir });
        spawnSync("git", ["config", "user.email", "test@test.com"], {
          cwd: tempDir,
        });
        spawnSync("git", ["config", "user.name", "Test"], { cwd: tempDir });

        // Create and track a file
        const trackedFile = path.join(tempDir, "tracked.txt");
        fs.writeFileSync(trackedFile, "tracked content");
        spawnSync("git", ["add", "tracked.txt"], { cwd: tempDir });
        spawnSync("git", ["commit", "-m", "initial"], { cwd: tempDir });

        // Create untracked file
        const untrackedFile = path.join(tempDir, "untracked.txt");
        fs.writeFileSync(untrackedFile, "untracked content");

        const files = Array.from(git.getGitFiles(tempDir));

        expect(files).toContain(trackedFile);
        expect(files).toContain(untrackedFile);
      });

      it("should not return ignored files", () => {
        // Initialize git repo
        const { spawnSync } = require("node:child_process");
        spawnSync("git", ["init"], { cwd: tempDir });

        // Create .gitignore
        const gitignorePath = path.join(tempDir, ".gitignore");
        fs.writeFileSync(gitignorePath, "*.log");

        // Create ignored file
        const ignoredFile = path.join(tempDir, "test.log");
        fs.writeFileSync(ignoredFile, "log content");

        // Create non-ignored file
        const normalFile = path.join(tempDir, "test.txt");
        fs.writeFileSync(normalFile, "normal content");

        const files = Array.from(git.getGitFiles(tempDir));

        expect(files).not.toContain(ignoredFile);
        expect(files).toContain(normalFile);
      });
    });

    describe("getGitIgnoreFilter", () => {
      it("should return empty filter when no .gitignore", () => {
        const filter = git.getGitIgnoreFilter(tempDir);

        expect(filter).toBeDefined();

        // Should not ignore anything
        const testFile = path.join(tempDir, "test.txt");
        fs.writeFileSync(testFile, "content");
        expect(filter.isIgnored(testFile, tempDir)).toBe(false);
      });

      it("should return filter with .gitignore patterns", () => {
        const gitignorePath = path.join(tempDir, ".gitignore");
        fs.writeFileSync(gitignorePath, "*.log");

        const filter = git.getGitIgnoreFilter(tempDir);

        const logFile = path.join(tempDir, "test.log");
        fs.writeFileSync(logFile, "content");

        expect(filter.isIgnored(logFile, tempDir)).toBe(true);
      });

      it("should cache filter", () => {
        const gitignorePath = path.join(tempDir, ".gitignore");
        fs.writeFileSync(gitignorePath, "*.log");

        const filter1 = git.getGitIgnoreFilter(tempDir);
        const filter2 = git.getGitIgnoreFilter(tempDir);

        expect(filter1).toBe(filter2);
      });

      it("should invalidate cache when .gitignore changes", async () => {
        const gitignorePath = path.join(tempDir, ".gitignore");
        fs.writeFileSync(gitignorePath, "*.log");

        const filter1 = git.getGitIgnoreFilter(tempDir);

        // Wait a bit and modify the file to change mtime
        await new Promise((resolve) => setTimeout(resolve, 100));
        fs.writeFileSync(gitignorePath, "*.tmp");

        const filter2 = git.getGitIgnoreFilter(tempDir);

        // Filters should be different objects after cache invalidation
        expect(filter1).not.toBe(filter2);

        // New filter should have new patterns
        const tmpFile = path.join(tempDir, "test.tmp");
        fs.writeFileSync(tmpFile, "content");
        expect(filter2.isIgnored(tmpFile, tempDir)).toBe(true);
      });
    });
  });
});
