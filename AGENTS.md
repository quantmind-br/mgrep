# AGENTS.md - Universal AI Agent Configuration

## Project Overview
`mgrep` is a TypeScript-based CLI tool for semantic code search and RAG-based question answering. It synchronizes local file systems with a Qdrant vector database using a "Sync-on-Demand" pattern. Supports OpenAI, Google, Anthropic, and Ollama.

## Issue Tracking (Beads)

This project uses **bd** (beads) for issue tracking.

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --status in_progress  # Claim work
bd close <id>         # Complete work
bd sync               # Sync with git
```

## Build & Test Commands
- **Install**: `npm install`
- **Build**: `npm run build`
- **Lint/Format**: `npm run lint` or `npm run lint:write` (Biome)
- **Test**: `npm run test` (Sets `MGREP_IS_TEST=1` for in-memory `TestStore`)
- **Run CLI**: `npm run start -- <command>` (via ts-node) or `./bin/run <command>` (built)
- **Start MCP**: `npm run start -- mcp`

## Architecture Overview
- **Pattern**: Provider-based Strategy pattern for AI backends and storage.
- **Composition Root**: `src/lib/context.ts` (Factory pattern) instantiates all services.
- **Core Layers**: CLI Commands (`src/commands`), Library Logic (`src/lib`), and Providers (`src/lib/providers`).
- **Storage**: `QdrantStore` handles vector operations, text chunking, and metadata.

## Key Conventions & Patterns
- **Indexing**: Files chunked into 50 lines with 10-line overlap (`QdrantStore.chunkText`).
- **Deterministic IDs**: Qdrant point IDs are SHA256 hashes of `externalId` + `chunkIndex`.
- **Filtering**: Uses `path_scopes` (e.g., `["/src", "/src/lib"]`) for efficient directory filtering.
- **Service Creation**: Use `createStore()` or `createFileSystem()` from `src/lib/context.ts`.
- **Sync Logic**: `initialSync` in `src/lib/utils.ts` reconciles disk state with Qdrant via SHA256 hashes.
- **Ignore Rules**: Respects `.gitignore` and `.mgrepignore` via `NodeFileSystem`.
- **MCP Server**: Stdio transport; redirects `stdout` to `stderr` for clean communication.

## MCP Integration
The MCP server exposes 8 tools for AI agent integration:

| Tool | Description |
|------|-------------|
| `mgrep-search` | Semantic search with path filtering and reranking |
| `mgrep-ask` | RAG Q&A with source citations |
| `mgrep-web-search` | Web search via Tavily (requires API key) |
| `mgrep-sync` | Sync local files with vector store |
| `mgrep-get-file` | Retrieve file content with line range support |
| `mgrep-list-files` | List indexed files with pagination |
| `mgrep-get-context` | Get expanded context around a line |
| `mgrep-stats` | Get store statistics |

## Code Style
- **Language**: TypeScript (Strict typing).
- **Format/Lint**: Biome.
- **Commits**: Conventional Commits (e.g., `feat(provider): add support for x`).

## Landing the Plane (Session Completion)

**When ending a work session**, complete ALL steps below:

**MANDATORY WORKFLOW:**
1. **File issues** for remaining work using `bd create`
2. **Run quality gates**: `npm run lint` and `npm run test`
3. **Update issue status**: Close finished work with `bd close <id>`
4. **PUSH TO REMOTE**:
   ```bash
   git pull --rebase
   bd sync
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Verify**: All changes committed AND pushed

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds
