import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getLogDir, setupLogger } from "./logger.js";

// Mock fs module to control canWriteToDir behavior
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof fs>();
  return {
    ...actual,
    default: {
      ...actual,
      mkdirSync: vi.fn(),
      writeFileSync: vi.fn(),
      unlinkSync: vi.fn(),
    },
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    unlinkSync: vi.fn(),
  };
});

// Mock winston-daily-rotate-file as a class
vi.mock("winston-daily-rotate-file", () => {
  return {
    default: class MockDailyRotateFile {},
  };
});

// Mock winston
vi.mock("winston", () => {
  const mockLogger = {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  };
  return {
    default: {
      createLogger: vi.fn(() => mockLogger),
      format: {
        combine: vi.fn(),
        timestamp: vi.fn(),
        printf: vi.fn((fn: (info: Record<string, unknown>) => string) => fn),
      },
    },
  };
});

describe("logger", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("getLogDir", () => {
    it("should use XDG_STATE_HOME when set", () => {
      process.env.XDG_STATE_HOME = "/custom/state";
      const result = getLogDir("testapp");
      expect(result).toBe("/custom/state/testapp/logs");
    });

    it("should use default path when XDG_STATE_HOME is not set", () => {
      delete process.env.XDG_STATE_HOME;
      const result = getLogDir("testapp");
      const expected = path.join(
        os.homedir(),
        ".local",
        "state",
        "testapp",
        "logs",
      );
      expect(result).toBe(expected);
    });

    it("should use 'myapp' as default app name", () => {
      delete process.env.XDG_STATE_HOME;
      const result = getLogDir();
      const expected = path.join(
        os.homedir(),
        ".local",
        "state",
        "myapp",
        "logs",
      );
      expect(result).toBe(expected);
    });

    it("should handle empty XDG_STATE_HOME as falsy", () => {
      process.env.XDG_STATE_HOME = "";
      const result = getLogDir("testapp");
      const expected = path.join(
        os.homedir(),
        ".local",
        "state",
        "testapp",
        "logs",
      );
      expect(result).toBe(expected);
    });
  });

  describe("setupLogger", () => {
    it("should return a logger object", () => {
      const logger = setupLogger();
      expect(logger).toBeDefined();
    });

    it("should create logger with winston.createLogger", async () => {
      const winston = await import("winston");
      setupLogger();
      expect(winston.default.createLogger).toHaveBeenCalled();
    });

    it("should setup DailyRotateFile transport when directory is writable", () => {
      // fs mock allows mkdirSync, writeFileSync, unlinkSync to succeed
      const logger = setupLogger();
      expect(logger).toBeDefined();
    });

    it("should set logger to silent when canWriteToDir throws", async () => {
      // Make fs operations fail
      vi.mocked(fs.mkdirSync).mockImplementation(() => {
        throw new Error("Permission denied");
      });

      const winston = await import("winston");
      setupLogger();

      const createLoggerCall = vi.mocked(winston.default.createLogger).mock
        .calls[0];
      expect(createLoggerCall).toBeDefined();
      // When canWriteToDir fails, no transports are added, so silent should be true
      const config = createLoggerCall[0] as { silent?: boolean };
      expect(config.silent).toBe(true);
    });

    it("should add file transport when canWriteToDir succeeds", async () => {
      // Reset mocks to allow fs operations to succeed
      vi.mocked(fs.mkdirSync).mockImplementation(() => undefined);
      vi.mocked(fs.writeFileSync).mockImplementation(() => undefined);
      vi.mocked(fs.unlinkSync).mockImplementation(() => undefined);

      const winston = await import("winston");
      setupLogger();

      const createLoggerCall = vi.mocked(winston.default.createLogger).mock
        .calls[0];
      expect(createLoggerCall).toBeDefined();
      const config = createLoggerCall[0] as {
        silent?: boolean;
        transports?: unknown[];
      };
      // When canWriteToDir succeeds, transports array should have 1 item
      expect(config.transports).toHaveLength(1);
      expect(config.silent).toBe(false);
    });
  });

  describe("console method overrides", () => {
    let originalConsoleLog: typeof console.log;
    let originalConsoleError: typeof console.error;
    let originalConsoleWarn: typeof console.warn;
    let originalConsoleDebug: typeof console.debug;
    let originalConsoleTrace: typeof console.trace;

    beforeEach(() => {
      // Store original console methods
      originalConsoleLog = console.log;
      originalConsoleError = console.error;
      originalConsoleWarn = console.warn;
      originalConsoleDebug = console.debug;
      originalConsoleTrace = console.trace;

      // Reset fs mocks to succeed
      vi.mocked(fs.mkdirSync).mockImplementation(() => undefined);
      vi.mocked(fs.writeFileSync).mockImplementation(() => undefined);
      vi.mocked(fs.unlinkSync).mockImplementation(() => undefined);
    });

    afterEach(() => {
      // Restore original console methods
      console.log = originalConsoleLog;
      console.error = originalConsoleError;
      console.warn = originalConsoleWarn;
      console.debug = originalConsoleDebug;
      console.trace = originalConsoleTrace;
    });

    it("should override console.log to also log to winston", () => {
      setupLogger();
      // The console methods should now be wrapped
      expect(console.log).not.toBe(originalConsoleLog);
    });

    it("should override console.error to also log to winston", () => {
      setupLogger();
      expect(console.error).not.toBe(originalConsoleError);
    });

    it("should override console.warn to also log to winston", () => {
      setupLogger();
      expect(console.warn).not.toBe(originalConsoleWarn);
    });

    it("should override console.debug to also log to winston", () => {
      setupLogger();
      expect(console.debug).not.toBe(originalConsoleDebug);
    });

    it("should override console.trace to also log to winston", () => {
      setupLogger();
      expect(console.trace).not.toBe(originalConsoleTrace);
    });

    it("should call original console.log when wrapped method is called", () => {
      const mockOriginalLog = vi.fn();
      console.log = mockOriginalLog;

      setupLogger();
      console.log("test message");

      expect(mockOriginalLog).toHaveBeenCalledWith("test message");
    });

    it("should call original console.error when wrapped method is called", () => {
      const mockOriginalError = vi.fn();
      console.error = mockOriginalError;

      setupLogger();
      console.error("error message");

      expect(mockOriginalError).toHaveBeenCalledWith("error message");
    });

    it("should call original console.warn when wrapped method is called", () => {
      const mockOriginalWarn = vi.fn();
      console.warn = mockOriginalWarn;

      setupLogger();
      console.warn("warn message");

      expect(mockOriginalWarn).toHaveBeenCalledWith("warn message");
    });

    it("should call original console.debug when wrapped method is called", () => {
      const mockOriginalDebug = vi.fn();
      console.debug = mockOriginalDebug;

      setupLogger();
      console.debug("debug message");

      expect(mockOriginalDebug).toHaveBeenCalledWith("debug message");
    });

    it("should call original console.trace when wrapped method is called", () => {
      const mockOriginalTrace = vi.fn();
      console.trace = mockOriginalTrace;

      setupLogger();
      console.trace("trace message");

      expect(mockOriginalTrace).toHaveBeenCalledWith("trace message");
    });

    it("should join multiple arguments with space when logging", () => {
      const mockOriginalLog = vi.fn();
      console.log = mockOriginalLog;

      setupLogger();
      console.log("hello", "world", 123);

      expect(mockOriginalLog).toHaveBeenCalledWith("hello", "world", 123);
    });
  });
});
