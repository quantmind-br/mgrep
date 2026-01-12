# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> For full project documentation, architecture diagrams, and API reference, see [README.md](README.md)

## Quick Reference

```bash
npm run build          # Build TypeScript
npm run test           # Run all tests
npm run test:unit      # Vitest unit tests
npm run lint           # Check with Biome
npm run start -- mcp   # Start MCP server
```

**Prerequisites**: Qdrant must be running for non-test modes: `docker run -p 6333:6333 qdrant/qdrant`

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

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/context.ts` | Composition Root - Factory for all services |
| `src/lib/store.ts` | Store interface + TestStore |
| `src/lib/providers/types.ts` | EmbeddingsClient, LLMClient interfaces |
| `src/commands/watch_mcp.ts` | MCP server implementation |
