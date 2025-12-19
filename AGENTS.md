# AGENTS.md - Universal AI Agent Configuration

## Project Overview
`mgrep` is a TypeScript-based CLI tool for semantic code search and RAG-based question answering. It uses a Qdrant vector database and supports multiple AI providers (OpenAI, Google, Anthropic, Ollama) for embeddings and LLMs.

## Build & Test Commands
- **Install**: `npm install`
- **Build**: `npm run build`
- **Lint/Format**: `npm run lint` (check) or `npm run lint:write` (fix)
- **Test**: `npm run test` (uses Bats and in-memory `TestStore`)
- **Run CLI**: `npm run start -- <command>` or `./bin/run <command>`

## Prerequisites
- **Qdrant**: Required for indexing. Run via Docker: `docker run -p 6333:6333 qdrant/qdrant`
- **API Keys**: Set `OPENAI_API_KEY`, `GOOGLE_API_KEY`, or `ANTHROPIC_API_KEY` as needed.

## Architecture Overview
- **Entry Point**: `src/index.ts` (Commander.js).
- **Commands**: `src/commands/` (e.g., `search.ts`, `watch.ts`, `watch_mcp.ts`).
- **Core Abstractions**: `src/lib/store.ts` defines the `Store` interface.
- **Implementations**: `src/lib/qdrant-store.ts` handles chunking, embedding, and vector search.
- **Provider System**: `src/lib/providers/` abstracts AI vendors (Embeddings/LLM).
- **Composition Root**: `src/lib/context.ts` uses the Factory pattern to instantiate services.

## Code Style Conventions
- **Language**: TypeScript.
- **Tooling**: Biome for linting and formatting.
- **Patterns**: Interface-based programming, Strategy pattern for providers, and Factory pattern for service creation.

## Key Conventions
- **Service Creation**: Always use `createStore()` or `createFileSystem()` from `src/lib/context.ts`.
- **Configuration**: Hierarchical: CLI Flags > Env Vars (`MGREP_*`) > `.mgreprc.yaml` > `~/.config/mgrep/config.yaml`.
- **Indexing**: Files are chunked (50 lines, 10 overlap) with deterministic IDs based on path and chunk index.
- **Filtering**: Uses `path_scopes` (e.g., `["/src", "/src/lib"]`) for efficient directory filtering in Qdrant.
- **Ignore Rules**: Respects `.gitignore` and `.mgrepignore` via `src/lib/file.ts`.

## Git Workflows
- **Branching**: `feat/`, `fix/`, `docs/`, `chore/`.
- **Commits**: Conventional Commits (e.g., `feat(search): add --content flag`).
