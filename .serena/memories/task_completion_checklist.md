# Task Completion Checklist

## Before Committing Changes

### 1. Type Checking
```bash
npm run typecheck
```
Ensure no TypeScript errors exist.

### 2. Linting
```bash
npm run lint
```
Check for lint errors. Fix with `npm run format` if needed.

### 3. Formatting
```bash
npm run format
```
Run Biome to format and organize imports.

### 4. Unit Tests
```bash
npm run test:unit
```
Run Vitest unit tests for `.test.ts` files in `src/`.

### 5. Integration Tests (if applicable)
```bash
npm run test
```
Run Bats integration tests (requires built project).

### 6. Build Verification
```bash
npm run build
```
Ensure the project builds successfully.

## Quick All-in-One Checks
```bash
npm run typecheck && npm run lint && npm run test:unit
```

## For Full Verification (including integration tests)
```bash
npm run build && npm run test:all
```

## Issue Tracking (bd/beads)
This project uses **bd (beads)** for issue tracking:
```bash
bd prime          # Get workflow context
bd ready          # Find unblocked work
bd create "Title" --type task --priority 2  # Create issue
bd close <id>     # Complete work
bd sync           # Sync with git (run at session end)
```

## Commit Guidelines
- Use conventional commit format
- Reference issues if applicable
- Keep commits atomic and focused

## Session Completion (Landing the Plane)
When ending a work session, complete ALL steps:
1. File issues for remaining work: `bd create`
2. Run quality gates: `npm run lint && npm run test`
3. Update issue status: `bd close <id>`
4. Push to remote:
   ```bash
   git pull --rebase
   bd sync
   git push
   git status  # MUST show "up to date with origin"
   ```

**Critical**: Work is NOT complete until `git push` succeeds.

## Notes
- Set `MGREP_IS_TEST=1` for unit tests to use in-memory TestStore
- Integration tests (Bats) are filtered by tags; use `--filter-tags !long-running` to skip slow tests