# AGENTS.md - Universal AI Agent Configuration

## Project Overview
`mgrep` is a TypeScript-based CLI tool for semantic code search and RAG-based question answering. It synchronizes local file systems with a Qdrant vector database and supports multiple AI providers (OpenAI, Google, Anthropic, Ollama) for embeddings and LLMs.

## Build & Test Commands
- **Install**: `npm install`
- **Build**: `npm run build`
- **Lint/Format**: `npm run lint` (check) or `npm run lint:write` (fix via Biome)
- **Test**: `npm run test` (Runs Bats tests; sets `MGREP_IS_TEST=1` for in-memory `TestStore`)
- **Run CLI**: `npm run start -- <command>` (via ts-node) or `./bin/run <command>` (built)

## Architecture Overview
- **Pattern**: Sync-on-Demand. Local files are reconciled with the vector store before search/query.
- **Layers**: CLI (`src/index.ts`) -> Commands (`src/commands/`) -> Service/Library (`src/lib/`) -> Providers.
- **Core Abstractions**: `Store` interface (`src/lib/store.ts`) implemented by `QdrantStore`.
- **Provider System**: Strategy pattern for `EmbeddingsClient` and `LLMClient` (OpenAI, Google, Anthropic).
- **Composition Root**: `src/lib/context.ts` uses Factory pattern to instantiate all services.

## Code Style Conventions
- **Language**: TypeScript (Strict typing preferred).
- **Tooling**: Biome for linting and formatting.
- **Patterns**: Strategy pattern for providers, Factory pattern for service creation, Adapter pattern for FS/Git.

## Key Conventions
- **Service Creation**: Always use `createStore()`, `createGit()`, or `createFileSystem()` from `src/lib/context.ts`.
- **Configuration**: Hierarchical: CLI Flags > Env Vars (`MGREP_*`) > `.mgreprc.yaml` > `~/.config/mgrep/config.yaml`.
- **Indexing**: Files are chunked (50 lines, 10 overlap) in `QdrantStore.chunkText`.
- **Deterministic IDs**: Qdrant point IDs are SHA256 hashes of `externalId` + `chunkIndex` for idempotency.
- **Filtering**: Uses `path_scopes` (e.g., `["/src", "/src/lib"]`) for efficient directory filtering in Qdrant.
- **Ignore Rules**: Respects `.gitignore` and `.mgrepignore` via `src/lib/file.ts`.

## Git Workflows
- **Branching**: `feat/`, `fix/`, `docs/`, `chore/`.
- **Commits**: Conventional Commits (e.g., `feat(provider): add deepseek support`).
