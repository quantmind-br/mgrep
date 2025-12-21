# AGENTS.md - Universal AI Agent Configuration

## Project Overview
`mgrep` is a TypeScript-based CLI tool for semantic code search, web search, and RAG-based question answering. It synchronizes local file systems with a Qdrant vector database and supports multiple AI providers (OpenAI, Google, Anthropic, Ollama) for embeddings and LLMs. Web search is powered by Tavily.

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
- **Provider System**: Strategy pattern for `EmbeddingsClient`, `LLMClient` (OpenAI, Google, Anthropic), and `WebSearchClient` (Tavily).
- **Composition Root**: `src/lib/context.ts` uses Factory pattern to instantiate all services.

## Code Style Conventions
- **Language**: TypeScript (Strict typing preferred).
- **Tooling**: Biome for linting and formatting.
- **Patterns**: Strategy pattern for providers, Factory pattern for service creation, Adapter pattern for FS/Git.

## Key Conventions
- **Service Creation**: Always use `createStore()`, `createGit()`, `createFileSystem()`, or `createWebSearchClientFromConfig()` from `src/lib/context.ts`.
- **Configuration**: Hierarchical: CLI Flags > Env Vars (`MGREP_*`) > `.mgreprc.yaml` > `~/.config/mgrep/config.yaml`.
- **Web Search**: Use `--web` flag with `MGREP_TAVILY_API_KEY` or `tavily.apiKey` in config.
- **Indexing**: Files are chunked (50 lines, 10 overlap) in `QdrantStore.chunkText`.
- **Deterministic IDs**: Qdrant point IDs are SHA256 hashes of `externalId` + `chunkIndex` for idempotency.
- **Filtering**: Uses `path_scopes` (e.g., `["/src", "/src/lib"]`) for efficient directory filtering in Qdrant.
- **Ignore Rules**: Respects `.gitignore` and `.mgrepignore` via `src/lib/file.ts`.

## Git Workflows
- **Branching**: `feat/`, `fix/`, `docs/`, `chore/`.
- **Commits**: Conventional Commits (e.g., `feat(provider): add deepseek support`).

## Landing the Plane (Session Completion)

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd sync
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds
