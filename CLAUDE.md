# CLAUDE.md - Guide for mgrep Development

Hello! I'm the developer of `mgrep`. This guide provides the context you need to effectively work on this semantic search CLI tool.

## Project Overview
`mgrep` is a modern, AI-powered replacement for `grep`. It indexes codebases into a Qdrant vector database and allows for semantic searching and RAG (Retrieval-Augmented Generation) question answering. It bridges local file systems with vector-based retrieval, supporting OpenAI, Anthropic, Google Gemini, and local Ollama instances.

## Common Commands
- **Install dependencies**: `npm install`
- **Build project**: `npm run build`
- **Lint & Format**: `npm run lint` (check) or `npm run lint:write` (fix via Biome)
- **Run tests**: `npm run test` (Runs Bats tests with `MGREP_IS_TEST=1`)
- **Run CLI locally**:
  - `npm run start -- search "query"` (Direct via ts-node)
  - `./bin/run search "query"` (After build)
- **Start MCP Server**: `npm run start -- mcp`

## Prerequisites for Development
1. **Qdrant**: Must be running for indexing/search.
   ```bash
   docker run -p 6333:6333 qdrant/qdrant
   ```
2. **API Keys**: Set at least one of `OPENAI_API_KEY`, `GOOGLE_API_KEY`, or `ANTHROPIC_API_KEY`.
3. **Web Search (optional)**: Set `MGREP_TAVILY_API_KEY` for web search functionality (`--web` flag).
4. **Test Mode**: Set `MGREP_IS_TEST=1` to bypass Qdrant and use the in-memory `TestStore`.

## Architecture & Key Components
The project follows a modular, provider-based architecture with a **Sync-on-Demand** pattern:

- **CLI Layer (`src/index.ts`, `src/commands/`)**: Uses `commander` to route commands.
  - `search.ts`: Primary interface for semantic search and RAG.
  - `watch.ts`: Monitors file system for incremental updates.
  - `watch_mcp.ts`: Implements Model Context Protocol for AI agent integration.
- **Service Abstraction (`src/lib/store.ts`)**: Defines the `Store` interface for all vector operations.
- **Qdrant Implementation (`src/lib/qdrant-store.ts`)**: Handles text chunking (50 lines/10 overlap), deterministic UUID generation for points, and path-scope metadata for filtering.
- **Provider Layer (`src/lib/providers/`)**:
  - `embeddings/`: OpenAI and Google implementations.
  - `llm/`: OpenAI, Google, and Anthropic implementations.
  - `web/`: Tavily implementation for web search.
- **Context Factory (`src/lib/context.ts`)**: The "Composition Root" where services are instantiated based on configuration.
- **Configuration (`src/lib/config.ts`)**: Hierarchical loading (CLI > Env > Local YAML > Global YAML) validated with Zod.
- **Sync Service (`src/lib/utils.ts`)**: `initialSync` reconciles local file system state with the vector store using SHA256 hashes.

## Code Style & Conventions
- **TypeScript**: Strict typing is preferred.
- **Formatting**: Handled by Biome. Run `npm run lint:write` before committing.
- **Commits**: Follow [Conventional Commits](https://www.conventionalcommits.org/) (e.g., `feat(provider): add support for deepseek`).
- **Branching**: Use prefixes like `feat/`, `fix/`, or `docs/`.

## Development Gotchas
- **Deterministic IDs**: We use SHA256 hashes of file paths and chunk indices to generate Qdrant point IDs. This ensures idempotency during sync.
- **Path Scoping**: We store paths as arrays (e.g., `/a/b/c` -> `["/", "/a", "/a/b", "/a/b/c"]`) to allow Qdrant to filter by directory prefix efficiently.
- **File Filtering**: `NodeFileSystem` (in `src/lib/file.ts`) integrates with `ignore` to respect `.gitignore` and `.mgrepignore`.
- **Logging**: We use `winston` with daily rotation. Logs are stored in `~/.local/state/mgrep/logs`.
- **MCP Integration**: `watch_mcp.ts` provides a Model Context Protocol server. It redirects `stdout` to `stderr` to keep the communication channel clean.

## Testing
Tests use the **Bats** framework. When running `npm run test`, the environment variable `MGREP_IS_TEST=1` is set, which forces `createStore()` to return a `TestStore` (in-memory) instead of connecting to Qdrant.
