# MCP Testing Guide

This guide provides manual E2E testing procedures for mgrep's Model Context Protocol (MCP) server using the [MCP Inspector](https://modelcontextprotocol.io/inspector/).

## Prerequisites

1. **Install MCP Inspector**:
   ```bash
   npm install -g @modelcontextprotocol/inspector
   ```

2. **Start mgrep MCP server**:
   ```bash
   npm run start -- mcp
   ```

3. **Launch Inspector**:
   ```bash
   mcp-inspector node .dist/commands/watch_mcp.js
   ```

Or use the automated script:
```bash
./scripts/test-mcp-e2e.sh
```

---

## Testing Checklist

### 1. General MCP Server

- [ ] Server starts without errors
- [ ] Stdout is redirected to stderr (no JSON-RPC pollution)
- [ ] Inspector successfully connects to server
- [ ] Server responds to ping/health checks

### 2. MCP Tools

#### All 10 Tools Registered
- [ ] All 10 tools appear in Inspector's "Tools" tab

| Tool | Status | Notes |
|------|--------|-------|
| mgrep-search | ☐ | |
| mgrep-ask | ☐ | |
| mgrep-web-search | ☐ | |
| mgrep-sync | ☐ | |
| mgrep-get-file | ☐ | |
| mgrep-list-files | ☐ | |
| mgrep-get-context | ☐ | |
| mgrep-stats | ☐ | |
| mgrep-find-symbol | ☐ | |
| mgrep-find-references | ☐ | |

#### Tool Tests

**mgrep-search**
- [ ] Valid query returns formatted results with score/filename/metadata
- [ ] Empty query throws appropriate error
- [ ] path_prefix parameter filters results correctly
- [ ] max_results > 10 clamps correctly
- [ ] include_content=true returns chunks with content

**mgrep-ask**
- [ ] Valid question returns response with sources array
- [ ] Empty question throws error
- [ ] Citations `<cite i="N">` are properly extracted
- [ ] Path filter parameter is passed correctly

**mgrep-web-search**
- [ ] Successful search returns formatted Tavily results
- [ ] Empty query throws error
- [ ] No results returns "No web results found" message
- [ ] include_content parameter works correctly

**mgrep-sync**
- [ ] Normal sync returns summary with file counts
- [ ] dry_run=true returns summary with "(dry run)" marker
- [ ] Sync error throws McpError with details

**mgrep-get-file**
- [ ] Valid file path returns content array
- [ ] start_line/end_line range returns correct slice
- [ ] Large file (>2000 lines) truncates with hint message
- [ ] Path traversal `../etc/passwd` throws "outside project root" error
- [ ] Absolute path within root is allowed

**mgrep-list-files**
- [ ] Basic list returns files array
- [ ] path_prefix filter works correctly
- [ ] limit parameter returns at most N files
- [ ] offset parameter skips first N results
- [ ] include_hash includes hash in response
- [ ] has_more=true when limit equals available count

**mgrep-get-context**
- [ ] Default context_lines=20 returns 20 lines
- [ ] Custom context_lines parameter respected
- [ ] Line at file start returns only lines after
- [ ] Line at file end returns only lines before
- [ ] Target line marked with '>' prefix
- [ ] Invalid path throws "File not found" error

**mgrep-stats**
- [ ] Returns JSON with store_name, file_count, chunk_count, last_sync
- [ ] Empty store returns counts as 0

**mgrep-find-symbol**
- [ ] Partial symbol matching works
- [ ] Exact match (exact=true) works correctly
- [ ] Type filter (function, class, etc.) works
- [ ] Path filter limits search correctly
- [ ] max_results parameter works
- [ ] Results include file path, line number, and symbol info

**mgrep-find-references**
- [ ] Finds all usages of a symbol
- [ ] path filter works correctly
- [ ] include_definition includes definition location when true
- [ ] max_results parameter works
- [ ] References show file path, line number, and context

### 3. MCP Resources

#### Resources Tab Functionality
- [ ] "Resources" tab appears in Inspector
- [ ] All indexed files are listed as resources
- [ ] Resource URIs follow format: `mgrep://file/{path}`

#### ListResources Handler
- [ ] Returns array of all indexed files
- [ ] Each resource has: name, uri, description (optional), mimeType
- [ ] Resources can be filtered/paginated (if implemented)

#### ReadResource Handler
- [ ] Reading a specific resource returns file content
- [ ] Content matches actual file content
- [ ] Large files are handled (truncated or chunked)
- [ ] Path traversal attempts are blocked
- [ ] Non-existent resource throws appropriate error

#### Security Tests (Resources)
- [ ] `mgrep://file/../../etc/passwd` blocked (path traversal)
- [ ] `mgrep://file//etc/passwd` blocked (absolute path outside root)
- [ ] Symlinks to outside directory are blocked
- [ ] Only files within project root are accessible

### 4. MCP Tool Annotations

#### Annotation Verification
- [ ] All 10 tools have `annotations` property
- [ ] Annotations follow MCP spec format

| Tool | readOnly | idempotent | destructive | Notes |
|------|-----------|-------------|-------------|--------|
| mgrep-search | ☐ | ☐ | ☐ | |
| mgrep-ask | ☐ | ☐ | ☐ | |
| mgrep-web-search | ☐ | ☐ | ☐ | |
| mgrep-sync | ☐ | ☐ | ☐ | |
| mgrep-get-file | ☐ | ☐ | ☐ | |
| mgrep-list-files | ☐ | ☐ | ☐ | |
| mgrep-get-context | ☐ | ☐ | ☐ | |
| mgrep-stats | ☐ | ☐ | ☐ | |
| mgrep-find-symbol | ☐ | ☐ | ☐ | |
| mgrep-find-references | ☐ | ☐ | ☐ | |

#### Annotation Behavior
- [ ] Read-only tools (search, ask, etc.) have `readOnlyHint: true`
- [ ] mgrep-sync has `idempotentHint: true`
- [ ] No tool has `destructiveHint: true` (none are destructive)

#### Agent Auto-Approval
- [ ] Read-only tools can be called without confirmation (if agent supports it)
- [ ] Test with Claude Code to verify auto-approval works
- [ ] Non-read-only tools (mgrep-sync) require confirmation

### 5. MCP Prompts

#### Prompts Tab Functionality
- [ ] "Prompts" tab appears in Inspector
- [ ] All 4 prompts are listed

| Prompt | Status | Notes |
|--------|--------|-------|
| codebase-overview | ☐ | |
| find-implementation | ☐ | |
| debug-flow | ☐ | |
| find-similar-code | ☐ | |

#### Prompt Execution Tests

**codebase-overview**
- [ ] Returns multi-step workflow
- [ ] Calls mgrep-tree (if available)
- [ ] Calls mgrep-stats for architecture info
- [ ] Calls mgrep-search for key components
- [ ] Provides comprehensive codebase overview

**find-implementation**
- [ ] Requires `feature` argument
- [ ] Returns multi-step workflow
- [ ] Searches for feature name in codebase
- [ ] Retrieves relevant files
- [ ] Builds context around implementation
- [ ] Provides clear implementation details

**debug-flow**
- [ ] Requires `entrypoint` argument
- [ ] Returns multi-step workflow
- [ ] Traces execution from entrypoint
- [ ] Finds function calls along the path
- [ ] Builds execution graph
- [ ] Provides clear debugging flow

**find-similar-code**
- [ ] Requires `code` argument
- [ ] Returns multi-step workflow
- [ ] Uses code snippet as semantic query
- [ ] Searches for similar patterns
- [ ] Returns similar code examples

#### GetPrompt Handler
- [ ] ListPrompts returns all 4 prompts
- [ ] Each prompt has correct name and description
- [ ] Prompt arguments are correctly defined
- [ ] GetPrompt returns structured prompt messages
- [ ] Prompt messages include required tool calls
- [ ] Invalid prompt name throws appropriate error

### 6. Integration Tests

#### Coexistence
- [ ] Tools, Resources, and Prompts handlers coexist without conflicts
- [ ] All handlers respond correctly to concurrent requests
- [ ] Server handles mixed tool/resource/prompt requests

#### Error Handling
- [ ] All handlers throw McpError for errors
- [ ] Error messages are clear and actionable
- [ ] Invalid parameters return proper error codes
- [ ] Server doesn't crash on malformed requests

---

## Test Execution Template

```bash
# 1. Start MCP server
npm run start -- mcp

# 2. In another terminal, launch Inspector
mcp-inspector node .dist/commands/watch_mcp.js

# 3. Follow checklist above
# 4. Document any issues found in the "Notes" column
```

## Known Issues

| Issue | Description | Workaround |
|--------|-------------|------------|
| | | |

---

## Version Information

- **mgrep version**: Run `npm run start -- --version` to check
- **MCP SDK version**: Check in `package.json` under `@modelcontextprotocol/sdk`
- **Inspector version**: Run `mcp-inspector --version`
