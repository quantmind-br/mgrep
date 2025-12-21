import { describe, it, expect } from "vitest";
import { getSkillVersion, getSkillVersionShort, loadSkill } from "./skill.js";

describe("skill", () => {
  describe("loadSkill", () => {
    it("should load SKILL.md content", () => {
      const skill = loadSkill();

      expect(skill).toBeDefined();
      expect(typeof skill).toBe("string");
      expect(skill.length).toBeGreaterThan(0);
    });

    it("should contain expected skill content", () => {
      const skill = loadSkill();

      // SKILL.md should contain mgrep-related content
      expect(skill.toLowerCase()).toContain("mgrep");
    });

    it("should contain skill metadata", () => {
      const skill = loadSkill();

      // Should have YAML frontmatter or skill definition
      expect(skill).toMatch(/name:\s*mgrep/i);
    });
  });

  describe("getSkillVersion", () => {
    it("should return a SHA256 hash", () => {
      const version = getSkillVersion();

      expect(version).toBeDefined();
      expect(typeof version).toBe("string");
      // SHA256 hash is 64 characters
      expect(version).toHaveLength(64);
      // Should only contain hex characters
      expect(version).toMatch(/^[a-f0-9]+$/);
    });

    it("should return consistent hash for same content", () => {
      const version1 = getSkillVersion();
      const version2 = getSkillVersion();

      expect(version1).toBe(version2);
    });
  });

  describe("getSkillVersionShort", () => {
    it("should return first 8 characters of hash", () => {
      const shortVersion = getSkillVersionShort();
      const fullVersion = getSkillVersion();

      expect(shortVersion).toHaveLength(8);
      expect(fullVersion.startsWith(shortVersion)).toBe(true);
    });
  });
});
