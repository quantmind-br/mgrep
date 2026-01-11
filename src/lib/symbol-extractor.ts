/**
 * Symbol extraction module for mgrep.
 *
 * Extracts function, class, interface, type, and variable definitions
 * from source code using regex patterns. Supports TypeScript, JavaScript,
 * Python, and Go.
 */

export type SymbolType =
  | "function"
  | "class"
  | "interface"
  | "type"
  | "variable"
  | "method";

export type Language =
  | "typescript"
  | "javascript"
  | "python"
  | "go"
  | "unknown";

export interface ExtractedSymbol {
  /** Symbol name (e.g., "createStore") */
  name: string;
  /** Symbol type (function, class, etc.) */
  type: SymbolType;
  /** 1-indexed line number where symbol is defined */
  line: number;
  /** Whether symbol is exported/public */
  exported: boolean;
  /** Optional function signature or type annotation */
  signature?: string;
  /** Parent class/module if applicable */
  containerName?: string;
}

interface PatternDefinition {
  pattern: RegExp;
  type: SymbolType;
  /** Group index for name (default: 1) */
  nameGroup?: number;
  /** Check if match indicates export */
  checkExported?: (match: RegExpMatchArray, line: string) => boolean;
  /** Extract signature from match */
  extractSignature?: (
    match: RegExpMatchArray,
    line: string,
  ) => string | undefined;
}

// ============================================================================
// TypeScript/JavaScript Patterns
// ============================================================================

const TS_PATTERNS: PatternDefinition[] = [
  // export async function name(
  // export function name(
  // async function name(
  // function name(
  {
    pattern: /^(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(/,
    type: "function",
    checkExported: (_m, line) => line.trimStart().startsWith("export"),
    extractSignature: (_m, line) => {
      const match = line.match(/function\s+\w+\s*\([^)]*\)/);
      return match ? match[0] : undefined;
    },
  },
  // export const name = async (
  // export const name = (
  // const name = async (
  // const name = (
  {
    pattern: /^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\(/,
    type: "function",
    checkExported: (_m, line) => line.trimStart().startsWith("export"),
  },
  // export const name = async () =>
  // export const name = () =>
  // const name = () =>
  {
    pattern:
      /^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\s*\([^)]*\)\s*(?::\s*[^=]+)?\s*=>/,
    type: "function",
    checkExported: (_m, line) => line.trimStart().startsWith("export"),
  },
  // export class Name
  // class Name
  // export abstract class Name
  {
    pattern: /^(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/,
    type: "class",
    checkExported: (_m, line) => line.trimStart().startsWith("export"),
  },
  // export interface Name
  // interface Name
  {
    pattern: /^(?:export\s+)?interface\s+(\w+)/,
    type: "interface",
    checkExported: (_m, line) => line.trimStart().startsWith("export"),
  },
  // export type Name =
  // type Name =
  {
    pattern: /^(?:export\s+)?type\s+(\w+)\s*(?:<[^>]*>)?\s*=/,
    type: "type",
    checkExported: (_m, line) => line.trimStart().startsWith("export"),
  },
  // export const NAME = (constant, uppercase)
  // const NAME = (constant, uppercase)
  {
    pattern: /^(?:export\s+)?const\s+([A-Z][A-Z0-9_]+)\s*=/,
    type: "variable",
    checkExported: (_m, line) => line.trimStart().startsWith("export"),
  },
  // export enum Name
  // enum Name
  {
    pattern: /^(?:export\s+)?enum\s+(\w+)/,
    type: "type",
    checkExported: (_m, line) => line.trimStart().startsWith("export"),
  },
  // Class methods: async methodName( or methodName(
  // Must be indented (inside class)
  {
    pattern: /^\s+(?:async\s+)?(\w+)\s*\([^)]*\)\s*(?::\s*[^{]+)?\s*\{/,
    type: "method",
    checkExported: () => true, // Methods inherit class visibility
  },
];

// ============================================================================
// Python Patterns
// ============================================================================

const PY_PATTERNS: PatternDefinition[] = [
  // def name(
  // async def name(
  {
    pattern: /^(?:async\s+)?def\s+(\w+)\s*\(/,
    type: "function",
    checkExported: (_m, line) => !line.match(/^\s+/), // Top-level = exported
    extractSignature: (_m, line) => {
      const match = line.match(/def\s+\w+\s*\([^)]*\)/);
      return match ? match[0] : undefined;
    },
  },
  // class Name:
  // class Name(Base):
  {
    pattern: /^class\s+(\w+)\s*(?:\([^)]*\))?\s*:/,
    type: "class",
    checkExported: () => true,
  },
  // NAME = value (module-level constant)
  {
    pattern: /^([A-Z][A-Z0-9_]+)\s*(?::\s*\w+)?\s*=/,
    type: "variable",
    checkExported: () => true,
  },
  // name: Type = value (typed variable)
  {
    pattern: /^(\w+)\s*:\s*\w+.*=/,
    type: "variable",
    checkExported: (_m, line) => !line.match(/^\s+/),
  },
];

// ============================================================================
// Go Patterns
// ============================================================================

const GO_PATTERNS: PatternDefinition[] = [
  // func Name(
  {
    pattern: /^func\s+(\w+)\s*\(/,
    type: "function",
    checkExported: (m) => /^[A-Z]/.test(m[1]), // Go: uppercase = exported
    extractSignature: (_m, line) => {
      const match = line.match(/func\s+\w+\s*\([^)]*\)/);
      return match ? match[0] : undefined;
    },
  },
  // func (receiver) Name(
  {
    pattern: /^func\s+\([^)]+\)\s+(\w+)\s*\(/,
    type: "method",
    checkExported: (m) => /^[A-Z]/.test(m[1]),
  },
  // type Name struct
  {
    pattern: /^type\s+(\w+)\s+struct\b/,
    type: "type",
    checkExported: (m) => /^[A-Z]/.test(m[1]),
  },
  // type Name interface
  {
    pattern: /^type\s+(\w+)\s+interface\b/,
    type: "interface",
    checkExported: (m) => /^[A-Z]/.test(m[1]),
  },
  // type Name = alias
  // type Name aliasType
  {
    pattern: /^type\s+(\w+)\s+(?!=)/,
    type: "type",
    checkExported: (m) => /^[A-Z]/.test(m[1]),
  },
  // const Name = or var Name =
  {
    pattern: /^(?:const|var)\s+(\w+)\s*(?:=|[A-Za-z])/,
    type: "variable",
    checkExported: (m) => /^[A-Z]/.test(m[1]),
  },
];

// ============================================================================
// Language Detection
// ============================================================================

/**
 * Detect programming language from file path extension.
 */
export function detectLanguage(path: string): Language {
  const ext = path.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "ts":
    case "tsx":
    case "mts":
    case "cts":
      return "typescript";
    case "js":
    case "jsx":
    case "mjs":
    case "cjs":
      return "javascript";
    case "py":
    case "pyw":
    case "pyi":
      return "python";
    case "go":
      return "go";
    default:
      return "unknown";
  }
}

/**
 * Get patterns for a specific language.
 */
function getPatternsForLanguage(language: Language): PatternDefinition[] {
  switch (language) {
    case "typescript":
    case "javascript":
      return TS_PATTERNS;
    case "python":
      return PY_PATTERNS;
    case "go":
      return GO_PATTERNS;
    default:
      return [];
  }
}

// ============================================================================
// Symbol Extraction
// ============================================================================

/**
 * Extract symbols from source code content.
 *
 * @param content - Source code content
 * @param pathOrLanguage - File path or language identifier
 * @returns Array of extracted symbols
 */
export function extractSymbols(
  content: string,
  pathOrLanguage: string,
): ExtractedSymbol[] {
  // Determine language
  const language: Language = [
    "typescript",
    "javascript",
    "python",
    "go",
  ].includes(pathOrLanguage as Language)
    ? (pathOrLanguage as Language)
    : detectLanguage(pathOrLanguage);

  if (language === "unknown") {
    return [];
  }

  const patterns = getPatternsForLanguage(language);
  const symbols: ExtractedSymbol[] = [];
  const lines = content.split("\n");

  // Track current class context for method detection
  let currentClass: string | undefined;
  let classIndent = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1;

    // Skip empty lines and comments
    const trimmed = line.trim();
    if (!trimmed || isCommentLine(trimmed, language)) {
      continue;
    }

    // Track class context
    const classMatch = line.match(
      /^(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/,
    );
    if (classMatch) {
      currentClass = classMatch[1];
      classIndent = line.search(/\S/);
    }

    // Check if we've exited the class (Python uses indentation)
    if (language === "python" && currentClass) {
      const currentIndent = line.search(/\S/);
      if (
        currentIndent >= 0 &&
        currentIndent <= classIndent &&
        !line.match(/^\s*$/)
      ) {
        currentClass = undefined;
      }
    }

    // Try each pattern
    for (const patternDef of patterns) {
      const match = line.match(patternDef.pattern);
      if (!match) continue;

      const nameGroup = patternDef.nameGroup ?? 1;
      const name = match[nameGroup];

      // Skip if name is a reserved word or too short
      if (!name || name.length < 2 || isReservedWord(name, language)) {
        continue;
      }

      // Skip constructor/init methods for method type
      if (patternDef.type === "method" && isConstructor(name, language)) {
        continue;
      }

      const exported = patternDef.checkExported
        ? patternDef.checkExported(match, line)
        : false;

      const signature = patternDef.extractSignature
        ? patternDef.extractSignature(match, line)
        : undefined;

      const symbol: ExtractedSymbol = {
        name,
        type: patternDef.type,
        line: lineNumber,
        exported,
        ...(signature && { signature }),
        ...(patternDef.type === "method" &&
          currentClass && { containerName: currentClass }),
      };

      symbols.push(symbol);
      break; // Only match first pattern per line
    }
  }

  return symbols;
}

/**
 * Check if a line is a comment.
 */
function isCommentLine(trimmedLine: string, language: Language): boolean {
  switch (language) {
    case "typescript":
    case "javascript":
    case "go":
      return (
        trimmedLine.startsWith("//") ||
        trimmedLine.startsWith("/*") ||
        trimmedLine.startsWith("*")
      );
    case "python":
      return (
        trimmedLine.startsWith("#") ||
        trimmedLine.startsWith('"""') ||
        trimmedLine.startsWith("'''")
      );
    default:
      return false;
  }
}

/**
 * Check if a name is a language reserved word.
 */
function isReservedWord(name: string, language: Language): boolean {
  const reserved: Record<Language, Set<string>> = {
    typescript: new Set([
      "if",
      "else",
      "for",
      "while",
      "do",
      "switch",
      "case",
      "break",
      "continue",
      "return",
      "throw",
      "try",
      "catch",
      "finally",
      "new",
      "delete",
      "typeof",
      "instanceof",
      "in",
      "of",
      "true",
      "false",
      "null",
      "undefined",
      "this",
      "super",
      "import",
      "export",
      "default",
      "from",
      "as",
      "async",
      "await",
      "yield",
      "get",
      "set",
    ]),
    javascript: new Set([
      "if",
      "else",
      "for",
      "while",
      "do",
      "switch",
      "case",
      "break",
      "continue",
      "return",
      "throw",
      "try",
      "catch",
      "finally",
      "new",
      "delete",
      "typeof",
      "instanceof",
      "in",
      "of",
      "true",
      "false",
      "null",
      "undefined",
      "this",
      "super",
      "import",
      "export",
      "default",
      "from",
      "as",
      "async",
      "await",
      "yield",
      "get",
      "set",
    ]),
    python: new Set([
      "if",
      "elif",
      "else",
      "for",
      "while",
      "break",
      "continue",
      "return",
      "yield",
      "try",
      "except",
      "finally",
      "raise",
      "import",
      "from",
      "as",
      "with",
      "pass",
      "lambda",
      "True",
      "False",
      "None",
      "and",
      "or",
      "not",
      "in",
      "is",
      "global",
      "nonlocal",
      "assert",
      "del",
    ]),
    go: new Set([
      "if",
      "else",
      "for",
      "switch",
      "case",
      "break",
      "continue",
      "return",
      "goto",
      "fallthrough",
      "defer",
      "panic",
      "recover",
      "go",
      "select",
      "chan",
      "map",
      "range",
      "true",
      "false",
      "nil",
      "iota",
      "package",
      "import",
      "const",
      "var",
      "type",
      "func",
      "struct",
      "interface",
      "default",
    ]),
    unknown: new Set(),
  };

  return reserved[language]?.has(name) ?? false;
}

/**
 * Check if a method name is a constructor.
 */
function isConstructor(name: string, language: Language): boolean {
  switch (language) {
    case "typescript":
    case "javascript":
      return name === "constructor";
    case "python":
      return (
        name === "__init__" || (name.startsWith("__") && name.endsWith("__"))
      );
    case "go":
      return false; // Go doesn't have constructors
    default:
      return false;
  }
}

// ============================================================================
// Symbol Search Helpers
// ============================================================================

/**
 * Filter symbols by type.
 */
export function filterByType(
  symbols: ExtractedSymbol[],
  type: SymbolType | "any",
): ExtractedSymbol[] {
  if (type === "any") return symbols;
  return symbols.filter((s) => s.type === type);
}

/**
 * Search symbols by name (supports partial matching).
 */
export function searchByName(
  symbols: ExtractedSymbol[],
  query: string,
  exact = false,
): ExtractedSymbol[] {
  const lowerQuery = query.toLowerCase();
  return symbols.filter((s) => {
    const lowerName = s.name.toLowerCase();
    return exact ? lowerName === lowerQuery : lowerName.includes(lowerQuery);
  });
}

/**
 * Check if a line contains a reference to a symbol (not definition).
 * Used for find-references functionality.
 */
export function isSymbolReference(
  line: string,
  symbolName: string,
  language: Language,
): boolean {
  // Create word boundary regex
  const escaped = symbolName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const wordBoundary = new RegExp(`\\b${escaped}\\b`);

  if (!wordBoundary.test(line)) {
    return false;
  }

  const trimmed = line.trim();

  // Skip comments
  if (isCommentLine(trimmed, language)) {
    return false;
  }

  // Skip string literals (basic check)
  // This is a simplified check - full string detection would require parsing
  const beforeSymbol = line.split(symbolName)[0];
  const singleQuotes = (beforeSymbol.match(/'/g) || []).length;
  const doubleQuotes = (beforeSymbol.match(/"/g) || []).length;
  const backticks = (beforeSymbol.match(/`/g) || []).length;

  // If odd number of quotes before symbol, it's likely inside a string
  if (singleQuotes % 2 !== 0 || doubleQuotes % 2 !== 0 || backticks % 2 !== 0) {
    return false;
  }

  return true;
}

/**
 * Get context around a line (for reference display).
 */
export function getLineContext(
  content: string,
  lineNumber: number,
  contextLines = 0,
): string {
  const lines = content.split("\n");
  const start = Math.max(0, lineNumber - 1 - contextLines);
  const end = Math.min(lines.length, lineNumber + contextLines);
  return lines.slice(start, end).join("\n");
}
