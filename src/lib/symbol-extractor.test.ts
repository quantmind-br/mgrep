import { describe, expect, it } from "vitest";
import {
  detectLanguage,
  type ExtractedSymbol,
  extractSymbols,
  filterByType,
  isSymbolReference,
  searchByName,
} from "./symbol-extractor.js";

describe("symbol-extractor", () => {
  describe("detectLanguage", () => {
    it("detects TypeScript files", () => {
      expect(detectLanguage("src/lib/store.ts")).toBe("typescript");
      expect(detectLanguage("component.tsx")).toBe("typescript");
      expect(detectLanguage("utils.mts")).toBe("typescript");
    });

    it("detects JavaScript files", () => {
      expect(detectLanguage("index.js")).toBe("javascript");
      expect(detectLanguage("App.jsx")).toBe("javascript");
      expect(detectLanguage("config.mjs")).toBe("javascript");
    });

    it("detects Python files", () => {
      expect(detectLanguage("main.py")).toBe("python");
      expect(detectLanguage("types.pyi")).toBe("python");
    });

    it("detects Go files", () => {
      expect(detectLanguage("main.go")).toBe("go");
    });

    it("returns unknown for unsupported extensions", () => {
      expect(detectLanguage("README.md")).toBe("unknown");
      expect(detectLanguage("styles.css")).toBe("unknown");
      expect(detectLanguage("noext")).toBe("unknown");
    });
  });

  describe("extractSymbols - TypeScript", () => {
    it("extracts exported function declarations", () => {
      const code = `export function createStore(): Store {
  return new Store();
}`;
      const symbols = extractSymbols(code, "typescript");
      expect(symbols).toHaveLength(1);
      expect(symbols[0]).toMatchObject({
        name: "createStore",
        type: "function",
        line: 1,
        exported: true,
      });
    });

    it("extracts async function declarations", () => {
      const code = `export async function fetchData(url: string): Promise<Data> {
  return fetch(url);
}`;
      const symbols = extractSymbols(code, "typescript");
      expect(symbols).toHaveLength(1);
      expect(symbols[0]).toMatchObject({
        name: "fetchData",
        type: "function",
        exported: true,
      });
    });

    it("extracts arrow function constants", () => {
      const code = `export const handleClick = () => {
  console.log("clicked");
};

const privateHelper = (x: number) => x * 2;`;
      const symbols = extractSymbols(code, "typescript");
      expect(symbols).toHaveLength(2);
      expect(symbols[0]).toMatchObject({
        name: "handleClick",
        type: "function",
        exported: true,
      });
      expect(symbols[1]).toMatchObject({
        name: "privateHelper",
        type: "function",
        exported: false,
      });
    });

    it("extracts class declarations", () => {
      const code = `export class Store {
  constructor() {}
}

export abstract class BaseService {
}

class PrivateHelper {}`;
      const symbols = extractSymbols(code, "typescript");
      expect(symbols.filter((s) => s.type === "class")).toHaveLength(3);
      expect(symbols.find((s) => s.name === "Store")).toMatchObject({
        type: "class",
        exported: true,
      });
      expect(symbols.find((s) => s.name === "BaseService")).toMatchObject({
        type: "class",
        exported: true,
      });
      expect(symbols.find((s) => s.name === "PrivateHelper")).toMatchObject({
        type: "class",
        exported: false,
      });
    });

    it("extracts interface declarations", () => {
      const code = `export interface Store {
  search(query: string): Promise<Results>;
}

interface InternalConfig {
  debug: boolean;
}`;
      const symbols = extractSymbols(code, "typescript");
      const interfaces = symbols.filter((s) => s.type === "interface");
      expect(interfaces).toHaveLength(2);
      expect(interfaces[0]).toMatchObject({
        name: "Store",
        exported: true,
      });
      expect(interfaces[1]).toMatchObject({
        name: "InternalConfig",
        exported: false,
      });
    });

    it("extracts type aliases", () => {
      const code = `export type SymbolType = "function" | "class";

type InternalState = {
  loading: boolean;
};

export type GenericType<T> = T extends string ? string : number;`;
      const symbols = extractSymbols(code, "typescript");
      const types = symbols.filter((s) => s.type === "type");
      expect(types).toHaveLength(3);
      expect(types[0].name).toBe("SymbolType");
      expect(types[1].name).toBe("InternalState");
      expect(types[2].name).toBe("GenericType");
    });

    it("extracts uppercase constants", () => {
      const code = `export const MAX_RETRIES = 3;
const DEFAULT_TIMEOUT = 5000;
const regularVariable = "not a constant";`;
      const symbols = extractSymbols(code, "typescript");
      const vars = symbols.filter((s) => s.type === "variable");
      expect(vars).toHaveLength(2);
      expect(vars[0].name).toBe("MAX_RETRIES");
      expect(vars[1].name).toBe("DEFAULT_TIMEOUT");
    });

    it("extracts enum declarations", () => {
      const code = `export enum Status {
  Pending,
  Active,
  Completed,
}

enum InternalState {
  Loading,
  Ready,
}`;
      const symbols = extractSymbols(code, "typescript");
      const enums = symbols.filter(
        (s) => s.name === "Status" || s.name === "InternalState",
      );
      expect(enums).toHaveLength(2);
      expect(enums[0]).toMatchObject({
        name: "Status",
        type: "type",
        exported: true,
      });
    });

    it("skips reserved words and short names", () => {
      const code = `const if = 1;
const x = 2;
function return() {}`;
      const symbols = extractSymbols(code, "typescript");
      expect(symbols).toHaveLength(0);
    });

    it("handles complex multi-symbol files", () => {
      const code = `export interface Config {
  debug: boolean;
}

export type ConfigKey = keyof Config;

export class ConfigManager {
  private config: Config;

  constructor(config: Config) {
    this.config = config;
  }

  getValue(key: ConfigKey): boolean {
    return this.config[key];
  }
}

export function createConfig(): Config {
  return { debug: false };
}

export const DEFAULT_CONFIG: Config = { debug: false };`;

      const symbols = extractSymbols(code, "typescript");
      expect(symbols.length).toBeGreaterThanOrEqual(4);

      const names = symbols.map((s) => s.name);
      expect(names).toContain("Config");
      expect(names).toContain("ConfigKey");
      expect(names).toContain("ConfigManager");
      expect(names).toContain("createConfig");
    });
  });

  describe("extractSymbols - Python", () => {
    it("extracts function definitions", () => {
      const code = `def calculate_total(items):
    return sum(items)

async def fetch_data(url):
    return await http.get(url)`;
      const symbols = extractSymbols(code, "python");
      expect(symbols).toHaveLength(2);
      expect(symbols[0]).toMatchObject({
        name: "calculate_total",
        type: "function",
      });
      expect(symbols[1]).toMatchObject({
        name: "fetch_data",
        type: "function",
      });
    });

    it("extracts class definitions", () => {
      const code = `class Store:
    def __init__(self):
        pass

class Database(Base):
    pass`;
      const symbols = extractSymbols(code, "python");
      const classes = symbols.filter((s) => s.type === "class");
      expect(classes).toHaveLength(2);
      expect(classes[0].name).toBe("Store");
      expect(classes[1].name).toBe("Database");
    });

    it("extracts module-level constants", () => {
      const code = `MAX_RETRIES = 3
DEFAULT_TIMEOUT = 5000
regular_var = "not constant"`;
      const symbols = extractSymbols(code, "python");
      const vars = symbols.filter((s) => s.type === "variable");
      expect(vars).toHaveLength(2);
      expect(vars[0].name).toBe("MAX_RETRIES");
      expect(vars[1].name).toBe("DEFAULT_TIMEOUT");
    });

    it("extracts typed variables", () => {
      const code = `config: Config = load_config()
count: int = 0`;
      const symbols = extractSymbols(code, "python");
      const vars = symbols.filter((s) => s.type === "variable");
      expect(vars.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("extractSymbols - Go", () => {
    it("extracts function definitions", () => {
      const code = `func CreateStore() *Store {
    return &Store{}
}

func privateHelper() {
}`;
      const symbols = extractSymbols(code, "python".replace("python", "go"));
      expect(symbols).toHaveLength(2);
      expect(symbols[0]).toMatchObject({
        name: "CreateStore",
        type: "function",
        exported: true,
      });
      expect(symbols[1]).toMatchObject({
        name: "privateHelper",
        type: "function",
        exported: false,
      });
    });

    it("extracts method definitions", () => {
      const code = `func (s *Store) Search(query string) []Result {
    return nil
}

func (s *Store) privateMethod() {
}`;
      const symbols = extractSymbols(code, "go");
      expect(symbols).toHaveLength(2);
      expect(symbols[0]).toMatchObject({
        name: "Search",
        type: "method",
        exported: true,
      });
      expect(symbols[1]).toMatchObject({
        name: "privateMethod",
        type: "method",
        exported: false,
      });
    });

    it("extracts struct definitions", () => {
      const code = `type Store struct {
    db *Database
}

type config struct {
    debug bool
}`;
      const symbols = extractSymbols(code, "go");
      const types = symbols.filter((s) => s.type === "type");
      expect(types).toHaveLength(2);
      expect(types[0]).toMatchObject({
        name: "Store",
        exported: true,
      });
      expect(types[1]).toMatchObject({
        name: "config",
        exported: false,
      });
    });

    it("extracts interface definitions", () => {
      const code = `type Searcher interface {
    Search(query string) []Result
}`;
      const symbols = extractSymbols(code, "go");
      const interfaces = symbols.filter((s) => s.type === "interface");
      expect(interfaces).toHaveLength(1);
      expect(interfaces[0]).toMatchObject({
        name: "Searcher",
        exported: true,
      });
    });
  });

  describe("filterByType", () => {
    const symbols: ExtractedSymbol[] = [
      { name: "createStore", type: "function", line: 1, exported: true },
      { name: "Store", type: "class", line: 10, exported: true },
      { name: "Config", type: "interface", line: 20, exported: true },
      { name: "ConfigType", type: "type", line: 30, exported: true },
    ];

    it("filters by specific type", () => {
      expect(filterByType(symbols, "function")).toHaveLength(1);
      expect(filterByType(symbols, "class")).toHaveLength(1);
      expect(filterByType(symbols, "interface")).toHaveLength(1);
    });

    it("returns all symbols for 'any' type", () => {
      expect(filterByType(symbols, "any")).toHaveLength(4);
    });
  });

  describe("searchByName", () => {
    const symbols: ExtractedSymbol[] = [
      { name: "createStore", type: "function", line: 1, exported: true },
      { name: "createConfig", type: "function", line: 10, exported: true },
      { name: "Store", type: "class", line: 20, exported: true },
    ];

    it("finds partial matches by default", () => {
      const results = searchByName(symbols, "create");
      expect(results).toHaveLength(2);
    });

    it("finds exact matches when specified", () => {
      const results = searchByName(symbols, "createStore", true);
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe("createStore");
    });

    it("is case-insensitive", () => {
      const results = searchByName(symbols, "STORE");
      expect(results).toHaveLength(2);
    });
  });

  describe("isSymbolReference", () => {
    it("detects symbol usage in code", () => {
      expect(
        isSymbolReference(
          "const store = createStore();",
          "createStore",
          "typescript",
        ),
      ).toBe(true);
      expect(
        isSymbolReference("store.search(query)", "search", "typescript"),
      ).toBe(true);
    });

    it("rejects partial matches", () => {
      expect(
        isSymbolReference(
          "createStoreWithConfig()",
          "createStore",
          "typescript",
        ),
      ).toBe(false);
      expect(
        isSymbolReference("myCreateStore()", "createStore", "typescript"),
      ).toBe(false);
    });

    it("rejects comments", () => {
      expect(
        isSymbolReference(
          "// createStore is called here",
          "createStore",
          "typescript",
        ),
      ).toBe(false);
      expect(
        isSymbolReference(
          "# createStore is called here",
          "createStore",
          "python",
        ),
      ).toBe(false);
    });

    it("rejects string literals (basic check)", () => {
      expect(
        isSymbolReference(
          'const name = "createStore"',
          "createStore",
          "typescript",
        ),
      ).toBe(false);
      expect(
        isSymbolReference(
          "const name = 'createStore'",
          "createStore",
          "typescript",
        ),
      ).toBe(false);
    });
  });

  describe("edge cases", () => {
    it("handles empty content", () => {
      const symbols = extractSymbols("", "typescript");
      expect(symbols).toHaveLength(0);
    });

    it("handles unknown language", () => {
      const symbols = extractSymbols("function test() {}", "unknown");
      expect(symbols).toHaveLength(0);
    });

    it("handles files with only comments", () => {
      const code = `// This is a comment
/* Block comment */
# Python comment`;
      const symbols = extractSymbols(code, "typescript");
      expect(symbols).toHaveLength(0);
    });
  });
});
