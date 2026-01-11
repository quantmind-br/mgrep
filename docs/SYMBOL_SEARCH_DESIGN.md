# Symbol Search Design Document

## Overview

This document describes the design for `mgrep-find-symbol` and `mgrep-find-references` MCP tools, enabling agents to locate function/class definitions and find all usages across the codebase.

## Goals

1. **Find Definitions**: Locate where functions, classes, interfaces, and types are defined
2. **Find References**: Find all usages of a symbol across the codebase
3. **Multi-language Support**: Initial support for TypeScript, JavaScript, Python, Go
4. **Performance**: Fast search over indexed files without full parsing
5. **Integration**: Seamless integration with existing mgrep semantic search

## Design Decisions

### Approach: Regex-based Extraction (Not AST)

**Decision**: Use regex patterns for symbol extraction instead of AST parsing.

**Rationale**:
- **Simplicity**: No need for language-specific parsers (tree-sitter, etc.)
- **Performance**: Regex is fast for large codebases
- **Consistency**: Follows patterns used by ctags, ripgrep, and similar tools
- **Sufficient Accuracy**: For definition detection, regex patterns are highly accurate
- **Existing Infrastructure**: Leverages mgrep's existing text indexing pipeline

### Symbol Types (LSP-aligned)

Based on LSP SymbolKind, we support a practical subset:

| Type | Description | Languages |
|------|-------------|-----------|
| `function` | Functions, methods | All |
| `class` | Classes | All |
| `interface` | Interfaces, protocols | TS, Go |
| `type` | Type aliases, structs | TS, Go, Python |
| `variable` | Constants, top-level vars | All |
| `method` | Class methods | All |

### Symbol Metadata

Each extracted symbol includes:

```typescript
interface Symbol {
  name: string;           // Symbol name (e.g., "createStore")
  type: SymbolType;       // function, class, interface, type, variable, method
  path: string;           // File path
  line: number;           // 1-indexed line number
  signature?: string;     // Function signature or type annotation
  containerName?: string; // Parent class/module if applicable
  exported: boolean;      // Whether symbol is exported
}
```

## Implementation Architecture

### 1. Symbol Extraction (`src/lib/symbol-extractor.ts`)

Regex patterns for each language/symbol type combination:

```typescript
// TypeScript/JavaScript patterns
const TS_PATTERNS = {
  function: [
    /^export\s+(?:async\s+)?function\s+(\w+)/gm,
    /^(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s*)?\(/gm,
    /^(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s*)?\s*\([^)]*\)\s*=>/gm,
  ],
  class: [
    /^export\s+(?:abstract\s+)?class\s+(\w+)/gm,
    /^class\s+(\w+)/gm,
  ],
  interface: [
    /^export\s+interface\s+(\w+)/gm,
    /^interface\s+(\w+)/gm,
  ],
  type: [
    /^export\s+type\s+(\w+)/gm,
    /^type\s+(\w+)/gm,
  ],
};

// Python patterns
const PY_PATTERNS = {
  function: [/^def\s+(\w+)\s*\(/gm, /^async\s+def\s+(\w+)\s*\(/gm],
  class: [/^class\s+(\w+)/gm],
  variable: [/^(\w+)\s*:\s*\w+\s*=/gm, /^([A-Z_][A-Z0-9_]*)\s*=/gm],
};

// Go patterns
const GO_PATTERNS = {
  function: [/^func\s+(\w+)\s*\(/gm, /^func\s+\([^)]+\)\s+(\w+)\s*\(/gm],
  type: [/^type\s+(\w+)\s+struct/gm, /^type\s+(\w+)\s+interface/gm],
  interface: [/^type\s+(\w+)\s+interface/gm],
};
```

### 2. Symbol Storage Strategy

**Decision**: Store symbols as part of existing chunk metadata, not separate collection.

**Rationale**:
- Symbols are extracted during sync when file content is processed
- Each chunk already has file metadata (path, line range)
- Adding symbol info to chunk payload enables semantic + symbol search

**Enhanced Chunk Payload**:
```typescript
interface EnhancedChunkPayload {
  // Existing fields
  path: string;
  path_scopes: string[];
  hash: string;
  content: string;
  start_line: number;
  num_lines: number;
  
  // New symbol fields
  symbols?: Array<{
    name: string;
    type: SymbolType;
    line: number;
    exported: boolean;
  }>;
}
```

### 3. MCP Tool: `mgrep-find-symbol`

```typescript
{
  name: "mgrep-find-symbol",
  description: "Find symbol definitions (functions, classes, interfaces, types) in the codebase",
  inputSchema: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "Symbol name to search for (supports partial matching)"
      },
      type: {
        enum: ["function", "class", "interface", "type", "variable", "any"],
        default: "any",
        description: "Filter by symbol type"
      },
      path: {
        type: "string",
        description: "Filter to specific directory (e.g., 'src/lib')"
      },
      exact: {
        type: "boolean",
        default: false,
        description: "Require exact name match (default: partial match)"
      }
    },
    required: ["name"]
  }
}
```

**Implementation**:
1. If symbols are pre-indexed: Query Qdrant with payload filter on `symbols.name`
2. Fallback: Use semantic search for symbol name + post-filter results
3. Apply path filter if provided
4. Return sorted by relevance/path

**Response Format**:
```json
{
  "symbols": [
    {
      "name": "createStore",
      "type": "function",
      "path": "src/lib/context.ts",
      "line": 42,
      "signature": "async function createStore(): Promise<Store>",
      "exported": true
    }
  ],
  "count": 1
}
```

### 4. MCP Tool: `mgrep-find-references`

```typescript
{
  name: "mgrep-find-references",
  description: "Find all usages/references of a symbol across the codebase",
  inputSchema: {
    type: "object",
    properties: {
      symbol: {
        type: "string",
        description: "Symbol name to find references for"
      },
      path: {
        type: "string",
        description: "Optional: File where symbol is defined (improves accuracy)"
      },
      include_definition: {
        type: "boolean",
        default: false,
        description: "Include the definition location in results"
      }
    },
    required: ["symbol"]
  }
}
```

**Implementation**:
1. Search for symbol name as text across all indexed chunks
2. Filter out false positives:
   - Comments (lines starting with //, #, /*, etc.)
   - String literals (text inside quotes)
   - Partial word matches (use word boundary detection)
3. Group by file, sort by line number
4. Optionally include definition (from find-symbol)

**Response Format**:
```json
{
  "references": [
    {
      "path": "src/commands/search.ts",
      "line": 15,
      "context": "const store = await createStore();",
      "type": "usage"
    },
    {
      "path": "src/commands/watch.ts", 
      "line": 23,
      "context": "const store = await createStore();",
      "type": "usage"
    }
  ],
  "definition": {
    "path": "src/lib/context.ts",
    "line": 42,
    "context": "export async function createStore(): Promise<Store>"
  },
  "count": 3
}
```

## Implementation Plan

### Phase 1: Symbol Extractor Module (mgrep-lib)
1. Create `src/lib/symbol-extractor.ts`
2. Implement regex patterns for TS/JS, Python, Go
3. Export `extractSymbols(content: string, language: string): Symbol[]`
4. Unit tests for extraction accuracy

### Phase 2: MCP Tools (mgrep-f8w, mgrep-buk)
1. Add `mgrep-find-symbol` tool definition
2. Implement handler using semantic search + filtering
3. Add `mgrep-find-references` tool definition  
4. Implement handler with false-positive filtering
5. Unit tests for both tools

### Phase 3: Symbol Indexing (Optional Enhancement)
1. Integrate symbol extraction into sync pipeline
2. Store symbols in chunk payload
3. Enable direct Qdrant filtering on symbol metadata

## Performance Considerations

1. **Initial Implementation**: Use semantic search for symbol names
   - Pros: No schema changes, works immediately
   - Cons: Slightly less accurate than indexed symbols

2. **Future Enhancement**: Index symbols during sync
   - Enables exact-match filtering in Qdrant
   - Faster for large codebases
   - Requires payload schema update

## Language Detection

Use file extension to determine language:

```typescript
function detectLanguage(path: string): Language {
  const ext = path.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'ts': case 'tsx': return 'typescript';
    case 'js': case 'jsx': case 'mjs': return 'javascript';
    case 'py': return 'python';
    case 'go': return 'go';
    default: return 'unknown';
  }
}
```

## False Positive Mitigation

For `find-references`, filter out:

1. **Comments**: `/^[\s]*(?:\/\/|#|\/\*|\*)/`
2. **String literals**: Detect if match is inside quotes
3. **Partial matches**: Use word boundaries `\b${symbol}\b`
4. **Import statements**: Optionally exclude import lines

## Testing Strategy

1. **Unit Tests** (`symbol-extractor.test.ts`):
   - Test each pattern against sample code
   - Test multi-language support
   - Test edge cases (async, generics, decorators)

2. **Integration Tests** (`watch_mcp.test.ts`):
   - Test tool registration
   - Test find-symbol with various filters
   - Test find-references accuracy
   - Test false positive filtering

3. **E2E Tests**:
   - Test against real codebase (mgrep itself)
   - Verify accuracy of symbol detection

## Security Considerations

1. **Path Validation**: Ensure path filters are within project root
2. **Input Sanitization**: Escape regex special characters in symbol names
3. **Result Limiting**: Cap results to prevent DoS (max 100 symbols/references)
