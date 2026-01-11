# MCP Prompts Design Document

## Overview

This document describes the design for MCP Prompts (workflow templates) for mgrep. These guided workflows help agents use mgrep more effectively for common development tasks.

## MCP Prompts Protocol

### ListPrompts Response Structure
```typescript
{
  prompts: Array<{
    name: string;
    description: string;
    arguments?: Array<{
      name: string;
      description: string;
      required: boolean;
    }>;
  }>;
}
```

### GetPrompt Response Structure
```typescript
{
  messages: Array<{
    role: "user" | "assistant";
    content: {
      type: "text";
      text: string;
    };
  }>;
}
```

## Prompts Specification

### 1. codebase-overview

**Purpose**: Get a comprehensive overview of the codebase structure and architecture.

**Arguments**: None required

**Workflow**:
1. Use `mgrep-stats` to get file count and store info
2. Use `mgrep-list-files` to show directory structure
3. Use `mgrep-search` for "architecture" and "main entry point"
4. Summarize project structure, main components, and patterns

**Response Message**:
```
Analyze this codebase using mgrep tools to provide a comprehensive overview:

1. **Get Statistics**: Use mgrep-stats to understand the scope
2. **Explore Structure**: Use mgrep-list-files to map the directory structure
3. **Find Architecture**: Use mgrep-search with queries like:
   - "main entry point configuration"
   - "core architecture components"
   - "API routes endpoints handlers"
4. **Identify Patterns**: Look for common patterns (providers, factories, services)

Provide a summary covering:
- Project size and scope
- Main directories and their purposes
- Key architectural patterns
- Entry points and configuration files
- Technology stack indicators
```

### 2. find-implementation

**Purpose**: Find how a specific feature is implemented in the codebase.

**Arguments**:
- `feature` (required): The feature or functionality to find

**Workflow**:
1. Use `mgrep-search` with the feature name
2. Use `mgrep-find-symbol` to locate relevant definitions
3. Use `mgrep-find-references` to trace usage
4. Use `mgrep-get-context` for surrounding code

**Response Message**:
```
Find the implementation of "{feature}" in this codebase:

1. **Semantic Search**: Use mgrep-search with queries:
   - "{feature}"
   - "{feature} implementation"
   - "{feature} handler logic"

2. **Symbol Search**: Use mgrep-find-symbol to find:
   - Functions/classes with "{feature}" in the name
   - Related types and interfaces

3. **Trace References**: Use mgrep-find-references on key symbols found

4. **Get Context**: Use mgrep-get-context to view surrounding code

Provide:
- Location of main implementation files
- Key functions/classes involved
- Data flow through the feature
- Configuration or dependencies required
```

### 3. debug-flow

**Purpose**: Trace the execution flow for debugging a specific functionality.

**Arguments**:
- `entrypoint` (required): The starting point for the trace (function, endpoint, etc.)

**Workflow**:
1. Use `mgrep-find-symbol` to locate the entrypoint
2. Use `mgrep-find-references` to find what calls it
3. Use `mgrep-search` for error handling patterns
4. Trace function calls and dependencies

**Response Message**:
```
Trace the execution flow starting from "{entrypoint}":

1. **Locate Entrypoint**: Use mgrep-find-symbol to find "{entrypoint}"

2. **Trace Callers**: Use mgrep-find-references to find:
   - What calls this function/endpoint
   - The chain of invocations leading here

3. **Find Dependencies**: Use mgrep-search for:
   - Functions called by this code
   - Services or modules imported
   - External API calls

4. **Error Handling**: Search for:
   - try/catch blocks in the flow
   - Error types and handlers
   - Logging statements

Provide:
- Step-by-step execution flow
- Key decision points
- Error handling paths
- Potential failure points
- Suggested debugging locations
```

### 4. find-similar-code

**Purpose**: Find code similar to a given snippet using semantic search.

**Arguments**:
- `code` (required): The code snippet to find similar patterns for

**Workflow**:
1. Use `mgrep-search` with the code pattern description
2. Find similar patterns and implementations
3. Show context around matches

**Response Message**:
```
Find code similar to this pattern:

```
{code}
```

1. **Semantic Search**: Use mgrep-search with descriptions of:
   - What this code does
   - The pattern or technique used
   - Similar functionality descriptions

2. **Pattern Matching**: Look for:
   - Similar function signatures
   - Same libraries/APIs being used
   - Analogous data transformations

3. **Get Context**: For each match, use mgrep-get-context

Provide:
- Files with similar code patterns
- Comparison of approaches
- Best practices found in similar code
- Suggestions for consistency
```

## Implementation

### Capability Registration

```typescript
capabilities: {
  tools: {},
  resources: {},
  prompts: {},  // Add prompts capability
}
```

### Prompt Definitions

```typescript
const MGREP_PROMPTS = [
  {
    name: "codebase-overview",
    description: "Get a comprehensive overview of the codebase structure and architecture",
  },
  {
    name: "find-implementation",
    description: "Find how a specific feature is implemented",
    arguments: [
      { name: "feature", description: "The feature to find", required: true }
    ],
  },
  {
    name: "debug-flow",
    description: "Trace the execution flow for debugging",
    arguments: [
      { name: "entrypoint", description: "Starting point (function/endpoint)", required: true }
    ],
  },
  {
    name: "find-similar-code",
    description: "Find code similar to a given snippet",
    arguments: [
      { name: "code", description: "Code snippet to find similar patterns for", required: true }
    ],
  },
];
```

### Handler Registration

```typescript
import {
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

server.setRequestHandler(ListPromptsRequestSchema, async () => {
  return { prompts: MGREP_PROMPTS };
});

server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  // Return appropriate message based on prompt name
});
```

## Testing Strategy

1. **Schema Tests**: Verify prompt definitions have correct structure
2. **ListPrompts Tests**: Ensure all 4 prompts are returned
3. **GetPrompt Tests**: Test each prompt with valid/invalid arguments
4. **Error Handling**: Test unknown prompt names, missing required args
