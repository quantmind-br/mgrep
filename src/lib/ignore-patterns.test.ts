import { describe, expect, it } from "vitest";
import {
  BINARY_PATTERNS,
  CONFIG_PATTERNS,
  GENERATED_PATTERNS,
  getCategoryInfo,
  getCategoryNames,
  getCategoryPatterns,
  getDefaultIgnorePatterns,
  IGNORE_CATEGORIES,
  VENDOR_PATTERNS,
} from "./ignore-patterns.js";

describe("ignore-patterns", () => {
  describe("pattern arrays", () => {
    it("VENDOR_PATTERNS is non-empty", () => {
      expect(VENDOR_PATTERNS.length).toBeGreaterThan(40);
    });

    it("GENERATED_PATTERNS is non-empty", () => {
      expect(GENERATED_PATTERNS.length).toBeGreaterThan(50);
    });

    it("BINARY_PATTERNS is non-empty", () => {
      expect(BINARY_PATTERNS.length).toBeGreaterThan(70);
    });

    it("CONFIG_PATTERNS is non-empty", () => {
      expect(CONFIG_PATTERNS.length).toBeGreaterThan(15);
    });
  });

  describe("getDefaultIgnorePatterns", () => {
    it("returns patterns from all enabled categories by default", () => {
      const patterns = getDefaultIgnorePatterns();

      expect(patterns).toContain("node_modules/");
      expect(patterns).toContain("dist/");
      expect(patterns).toContain("*.png");
      expect(patterns).not.toContain(".github/");
    });

    it("excludes config patterns by default", () => {
      const patterns = getDefaultIgnorePatterns();

      expect(patterns).not.toContain(".github/");
      expect(patterns).not.toContain(".vscode/");
      expect(patterns).not.toContain("Dockerfile*");
    });

    it("includes config patterns when explicitly enabled", () => {
      const patterns = getDefaultIgnorePatterns({ config: true });

      expect(patterns).toContain(".github/");
      expect(patterns).toContain(".vscode/");
    });

    it("can disable specific categories", () => {
      const patterns = getDefaultIgnorePatterns({
        vendor: false,
        generated: true,
        binary: false,
      });

      expect(patterns).not.toContain("node_modules/");
      expect(patterns).toContain("dist/");
      expect(patterns).not.toContain("*.png");
    });

    it("returns empty array when all categories disabled", () => {
      const patterns = getDefaultIgnorePatterns({
        vendor: false,
        generated: false,
        binary: false,
        config: false,
      });

      expect(patterns).toHaveLength(0);
    });
  });

  describe("getCategoryPatterns", () => {
    it("returns vendor patterns", () => {
      const patterns = getCategoryPatterns("vendor");
      expect(patterns).toBe(VENDOR_PATTERNS);
    });

    it("returns generated patterns", () => {
      const patterns = getCategoryPatterns("generated");
      expect(patterns).toBe(GENERATED_PATTERNS);
    });

    it("returns binary patterns", () => {
      const patterns = getCategoryPatterns("binary");
      expect(patterns).toBe(BINARY_PATTERNS);
    });

    it("returns config patterns", () => {
      const patterns = getCategoryPatterns("config");
      expect(patterns).toBe(CONFIG_PATTERNS);
    });
  });

  describe("getCategoryNames", () => {
    it("returns all category names", () => {
      const names = getCategoryNames();
      expect(names).toEqual(["vendor", "generated", "binary", "config"]);
    });
  });

  describe("getCategoryInfo", () => {
    it("returns info for all categories", () => {
      const info = getCategoryInfo();

      expect(info).toHaveLength(4);
      expect(info[0]).toEqual({
        name: "vendor",
        description: "Third-party dependencies and vendor directories",
        patternCount: VENDOR_PATTERNS.length,
        enabled: true,
      });
    });

    it("shows config as disabled by default", () => {
      const info = getCategoryInfo();
      const configInfo = info.find((i) => i.name === "config");

      expect(configInfo?.enabled).toBe(false);
    });
  });

  describe("IGNORE_CATEGORIES structure", () => {
    it("has correct number of categories", () => {
      expect(IGNORE_CATEGORIES).toHaveLength(4);
    });

    it("all categories have required fields", () => {
      for (const category of IGNORE_CATEGORIES) {
        expect(category.name).toBeDefined();
        expect(category.description).toBeDefined();
        expect(Array.isArray(category.patterns)).toBe(true);
        expect(typeof category.enabled).toBe("boolean");
      }
    });

    it("vendor, generated, binary enabled by default", () => {
      const enabledByDefault = IGNORE_CATEGORIES.filter((c) => c.enabled).map(
        (c) => c.name,
      );
      expect(enabledByDefault).toEqual(["vendor", "generated", "binary"]);
    });
  });

  describe("pattern validity", () => {
    const allPatterns = [
      ...VENDOR_PATTERNS,
      ...GENERATED_PATTERNS,
      ...BINARY_PATTERNS,
      ...CONFIG_PATTERNS,
    ];

    it("all patterns are non-empty strings", () => {
      for (const pattern of allPatterns) {
        expect(typeof pattern).toBe("string");
        expect(pattern.length).toBeGreaterThan(0);
      }
    });

    it("no duplicate patterns within same category", () => {
      const categories = [
        VENDOR_PATTERNS,
        GENERATED_PATTERNS,
        BINARY_PATTERNS,
        CONFIG_PATTERNS,
      ];

      for (const patterns of categories) {
        const unique = new Set(patterns);
        expect(unique.size).toBe(patterns.length);
      }
    });
  });
});
