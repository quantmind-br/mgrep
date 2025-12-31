import { describe, expect, it } from "vitest";
import { clearConfigCache, loadConfig } from "./config.js";

describe("Config - Ignore Patterns", () => {
  it("has default values", () => {
    const config = loadConfig(process.cwd());
    expect(config.ignore.categories.vendor).toBe(true);
    expect(config.ignore.categories.generated).toBe(true);
    expect(config.ignore.categories.binary).toBe(true);
    expect(config.ignore.categories.config).toBe(false);
    expect(config.ignore.additional).toEqual([]);
    expect(config.ignore.exceptions).toEqual([]);
  });

  it("loads config from env vars", () => {
    process.env.MGREP_IGNORE_VENDOR = "false";
    process.env.MGREP_IGNORE_CONFIG = "true";

    clearConfigCache();

    const config = loadConfig(process.cwd());

    expect(config.ignore.categories.vendor).toBe(false);
    expect(config.ignore.categories.config).toBe(true);

    delete process.env.MGREP_IGNORE_VENDOR;
    delete process.env.MGREP_IGNORE_CONFIG;
    clearConfigCache();
  });
});
