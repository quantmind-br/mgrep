# AGENTS.md - AI Agent Workflow Guide

Configuration for AI agents working with the mgrep codebase.

> For full project documentation, see [README.md](README.md)
> For development patterns, see [CLAUDE.md](CLAUDE.md)

## Quick Reference

```bash
npm run build          # Build TypeScript
npm run test           # Run all tests
npm run test:unit      # Vitest unit tests
npm run start -- mcp   # Start MCP server
```

## Issue Tracking (Beads)

This project uses **bd (beads)** for issue tracking.

```bash
bd prime                              # Get workflow context
bd ready                              # Find unblocked work
bd create "Title" --type task -p 2    # Create issue
bd close <id>                         # Complete work
```

For full workflow details: `bd prime`

## MCP Development

When modifying MCP tools:

1. **Add/update tests** in:
   - `src/commands/watch_mcp.test.ts` - Unit tests
   - `src/commands/watch_mcp.helper.test.ts` - Helper functions
   - `src/commands/watch_mcp.integration.test.ts` - Integration tests

2. **Run tests before committing**:
   ```bash
   npm run test:unit -- watch_mcp
   ```

3. **Key files**:
   - `src/commands/watch_mcp.ts` - MCP server
   - `src/lib/test-mcp-client.ts` - TestMCPClient
   - `src/lib/store.ts` - TestStore

## Session Completion Protocol

**When ending a work session**, complete ALL steps:

1. **File issues** for remaining work: `bd create`
2. **Run quality gates**: `npm run lint && npm run test`
3. **Close finished work**: `bd close <id>`
4. **Push to remote**:
   ```bash
   git pull --rebase
   bd sync
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Verify**: All changes committed AND pushed

**Critical Rules:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- If push fails, resolve and retry until it succeeds
