# Code Style & Conventions

## TypeScript Configuration
- **Target**: ES2022
- **Module System**: NodeNext (ESM with .js extensions in imports)
- **Strict Mode**: Enabled with additional checks:
  - `noUnusedLocals`
  - `noUnusedParameters`
  - `noImplicitReturns`
  - `noFallthroughCasesInSwitch`
  - `forceConsistentCasingInFileNames`

## Formatting (Biome)
- **Indent**: 2 spaces
- **Quotes**: Double quotes for JavaScript/TypeScript
- **Organized Imports**: Automatic import sorting enabled
- Run `npm run format` before committing

## Linting (Biome)
- Uses recommended rules
- Run `npm run lint` to check

## Design Patterns Used
- **Strategy Pattern**: For Store, EmbeddingsClient, LLMClient interfaces
- **Factory Pattern**: Centralized in `src/lib/context.ts` for dependency injection
- **Adapter Pattern**: For file system and git operations

## Naming Conventions
- **Files**: kebab-case (e.g., `qdrant-store.ts`, `sync-helpers.ts`)
- **Classes/Interfaces**: PascalCase (e.g., `QdrantStore`, `EmbeddingsClient`)
- **Functions/Variables**: camelCase
- **Constants**: UPPER_SNAKE_CASE for env-related constants
- **Test Files**: `*.test.ts` co-located with source files

## Commit Messages
Follow [Conventional Commits](https://www.conventionalcommits.org/):
- `feat(scope): description` - New features
- `fix(scope): description` - Bug fixes
- `docs(scope): description` - Documentation
- `refactor(scope): description` - Code refactoring
- `test(scope): description` - Test additions/changes
- `chore(scope): description` - Maintenance

## Branch Naming
Use prefixes: `feat/`, `fix/`, `docs/`

## Key Implementation Notes
- **Deterministic IDs**: SHA256 hashes of file paths + chunk indices for Qdrant points
- **Path Scoping**: Paths stored as arrays for prefix filtering
- **File Filtering**: Uses `ignore` library for .gitignore/.mgrepignore
- **Logging**: Winston with daily rotation at `~/.local/state/mgrep/logs`
- **MCP Integration**: Redirects stdout to stderr to keep communication channel clean
