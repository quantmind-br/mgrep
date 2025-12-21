# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

`mgrep` is a semantic search CLI tool that synchronizes local codebases with Qdrant vector storage for RAG-based question answering and semantic discovery. It supports OpenAI, Anthropic, Google Gemini, and Ollama as AI providers.

## Commands

```bash
# Development
npm install                        # Install dependencies
npm run build                      # Build TypeScript to dist/
npm run dev                        # Build and run

# Testing
npm run test                       # BATS end-to-end tests (sets MGREP_IS_TEST=1)
npm run test:unit                  # Vitest unit tests
npm run test:unit:watch            # Vitest watch mode
npm run test:coverage              # Coverage report
npm run test:all                   # Run both unit and e2e tests

# Code Quality
npm run lint                       # Check with Biome
npm run format                     # Fix with Biome
npm run typecheck                  # TypeScript type checking

# Running Locally
npm run start -- search "query"    # Via ts-node
npm run start -- mcp               # Start MCP server
./bin/run search "query"           # After build
```

**Prerequisites**: Qdrant must be running for non-test modes: `docker run -p 6333:6333 qdrant/qdrant`

## Architecture

**Three-layer Provider-based Strategy pattern:**

1. **Command Layer** (`src/commands/`): CLI commands using Commander.js
   - `search.ts` - Semantic search and RAG pipeline
   - `watch.ts` - Real-time filesystem monitoring
   - `watch_mcp.ts` - MCP server for AI agent integration

2. **Service Layer** (`src/lib/`):
   - `context.ts` - **Composition Root**: Factory for all service instantiation
   - `qdrant-store.ts` - Vector storage, chunking, and search
   - `config.ts` - Hierarchical config with Zod validation
   - `file.ts` / `git.ts` - Filesystem with .gitignore/.mgrepignore support

3. **Provider Layer** (`src/lib/providers/`):
   - `embeddings/` - OpenAI, Google embeddings
   - `llm/` - OpenAI, Anthropic, Google LLM clients
   - `web/` - Tavily web search

**Key files:**
- `src/lib/store.ts` - Store interface + TestStore for testing
- `src/lib/providers/types.ts` - EmbeddingsClient, LLMClient interfaces

## Critical Patterns

### Factory Pattern (Mandatory)
Never instantiate services directly. Use factory functions from `src/lib/context.ts`:
```typescript
const store = await createStore();        // Not: new QdrantStore(...)
const fs = createFileSystem();            // Not: new NodeFileSystem(...)
```

### Deterministic Point IDs
Qdrant point IDs are SHA256 hashes of `externalId` (file path) + `chunkIndex`. This makes sync operations idempotent.

### Path Scoping for Filtering
Files are indexed with a `path_scopes` array enabling hierarchical filtering:
`/src/lib/file.ts` → `['/', '/src', '/src/lib', '/src/lib/file.ts']`

### Chunking
Files split into 50-line chunks with 10-line overlap to preserve context at boundaries.

### Sync-on-Demand
`search` and `ask` commands trigger `initialSync` before processing. Uses SHA256 hashes to detect changes.

### MCP Server Logging
When running as MCP server, all logging must go to `stderr` - `stdout` is reserved for JSON-RPC transport.

### Test Mode
Setting `MGREP_IS_TEST=1` causes `createStore()` to return an in-memory `TestStore` instead of connecting to Qdrant.

## Configuration

**Hierarchy** (highest to lowest priority):
CLI Flags → Environment Variables (`MGREP_*`) → Local `.mgreprc.yaml` → Global `~/.config/mgrep/config.yaml`

All config schemas defined with Zod in `src/lib/config.ts`.

## Code Style

- **TypeScript**: Strict typing, avoid `any`
- **Format/Lint**: Biome (`npm run format` before committing)
- **Commits**: Conventional Commits (e.g., `feat(llm): add deepseek provider`)
- **Branches**: Use prefixes `feat/`, `fix/`, `docs/`

## Adding a New Provider

1. Create implementation in `src/lib/providers/[embeddings|llm|web]/`
2. Register in factory at `src/lib/providers/index.ts`
3. Update Zod schema in `src/lib/config.ts`

## MCP Server Tools

The MCP server (`npm run start -- mcp`) exposes 8 tools:

### Core Tools
- **mgrep-search**: `query`, `path?`, `max_results?`, `include_content?`, `rerank?`
- **mgrep-ask**: `question`, `path?`, `max_results?`, `rerank?`
- **mgrep-web-search**: `query`, `max_results?`, `include_content?`
- **mgrep-sync**: `dry_run?`

### Utility Tools
- **mgrep-get-file**: `path`, `start_line?`, `end_line?` - Retrieve file content with line range
- **mgrep-list-files**: `path_prefix?`, `limit?`, `offset?`, `include_hash?` - List indexed files
- **mgrep-get-context**: `path`, `line`, `context_lines?` - Get expanded context around a line
- **mgrep-stats**: (no parameters) - Get store statistics

### Testing MCP Tools
```bash
npx @anthropic-ai/mcp-inspector
```
