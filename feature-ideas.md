# mgrep Feature Roadmap

> **Analysis Date**: 2025-01-11  
> **Methodology**: Deep critical analysis with codebase context review

## Implementation Priority Order

Features are ordered by: dependencies (prerequisites first), value-to-effort ratio, and risk mitigation.

---

## Phase 1: Quick Wins (High Value, Low Effort)

### 1. Smart Context Exporter
**Status**: Ready to implement  
**Complexity**: Small  
**Estimated Effort**: 1-2 days

A command `mgrep context "query"` (or `mgrep search --export`) that retrieves relevant code chunks via semantic search and formats them into a single, optimized prompt block for use with external LLMs.

**User Problem**: Developers often use mgrep to find code, but then want to paste that code into web-based LLMs (ChatGPT, Claude). Manually opening and copying multiple files is tedious.

**User Benefit**: Bridges the gap between local CLI search and powerful web-based AI models, saving time on context gathering.

**Implementation Notes**:
- Reuse existing search infrastructure with a new output formatter
- Output format: XML-style `<file path="...">content</file>` for easy LLM parsing
- Default to stdout, add `--clipboard` (`-c`) flag for clipboard copy
- Add `--max-tokens` flag to estimate and limit context size
- Consider `--format` flag for different output styles (xml, markdown, plain)

**Dependencies**: `src/commands/search.ts`  
**New Components**: `ContextFormatter`  
**Affected Areas**: `src/commands/search.ts`, `src/lib/utils.ts`

---

## Phase 2: UX Improvements (Medium Value, Adjusted Effort)

### 2. Simplified Results Navigation
**Status**: Scope reduced from TUI  
**Complexity**: Small-Medium  
**Estimated Effort**: 2-3 days

Instead of a full TUI, implement lightweight navigation options:

**Option A (Recommended)**: fzf Integration
- Add `--fzf` flag that pipes output to fzf for interactive selection
- Selected result opens in `$EDITOR` at the correct line
- Zero new dependencies (fzf is external)

**Option B**: Terminal Hyperlinks
- Implement OSC 8 hyperlinks in output
- Modern terminals (iTerm2, Windows Terminal, GNOME Terminal) support clicking `file:line` links
- Graceful degradation in unsupported terminals

**User Problem**: For large result sets, users must scroll their terminal buffer and manually copy file paths/line numbers.

**User Benefit**: Rapid navigation without context switching, using familiar tools.

**Implementation Notes**:
- Start with fzf integration as it's zero-dependency
- Add hyperlink support as enhancement
- Full TUI can be revisited if these prove insufficient

**Dependencies**: `src/commands/search.ts`  
**New Components**: `FzfPipe`, `HyperlinkFormatter`

---

### 3. Auto-Spawn Background Watcher
**Status**: Scope reduced from daemon  
**Complexity**: Small-Medium  
**Estimated Effort**: 2-3 days

Automatically keep the index fresh without requiring manual daemon management.

**Approach**: Use a lockfile + background fork pattern:
1. `mgrep search` checks if watcher is running (via pidfile in `~/.mgrep/`)
2. If not running, spawns `mgrep watch` as a detached background process
3. No daemon manager needed - uses Node's `child_process.spawn` with `detached: true`

**User Problem**: The `mgrep watch` command must be left running in an active terminal. Users forget to run it, leading to stale search results.

**User Benefit**: Search "just works" with fresh results, transparently.

**Implementation Notes**:
- Store pidfile at `~/.mgrep/watcher.pid`
- Add `mgrep watcher status|stop` subcommands for control
- Consider `--no-auto-watch` flag for CI/scripting environments
- Avoid OS-specific daemon managers (launchd, systemd, PM2)

**Dependencies**: `src/commands/watch.ts`  
**New Components**: `WatcherManager`  
**Affected Areas**: `src/commands/search.ts`, `src/commands/watch.ts`

---

## Phase 3: Future Considerations (Deferred)

### Semantic Audit / CI Gate
**Status**: Deferred  
**Reason**: LLM-based CI gates are not production-ready due to non-determinism

**Original Concept**: A command `mgrep audit` that accepts natural language assertions and returns non-zero exit code if violated.

**Why Deferred**:
- LLM hallucinations cause unacceptable false positive/negative rates for CI
- Determinism is a hard requirement for gating builds
- Better suited as a "surface for review" tool than a gate

**Potential Pivot**: `mgrep validate` that uses semantic search to surface potential violations for human review (informational, not blocking).

**Revisit When**: LLM structured output reliability improves significantly.

---

### Pluggable File Parsers
**Status**: Deferred  
**Reason**: Current fixed chunking works for 90% of use cases

**Original Concept**: Configuration option for custom chunking strategies per file extension.

**Why Deferred**:
- Low user demand signal for edge cases (SQL dumps, large JSON)
- Plugin systems add significant maintenance burden
- Risk of performance degradation with poorly written regex

**Simpler Alternative** (if needed):
```yaml
chunking:
  ".sql": { lines: 100, overlap: 20 }
  ".json": { lines: 200, overlap: 50 }
```

**Revisit When**: Clear user demand emerges, or AST-based chunking (tree-sitter) becomes viable.

---

## Discarded Features

### Git Patch Generation
**Status**: Discarded  
**Reason**: Scope creep; better tools exist

**Original Concept**: Extension of `ask` command to generate apply-able git patches.

**Why Discarded**:
1. **Safety risk**: Invalid patches can corrupt code
2. **Out of scope**: mgrep's core value is retrieval, not code modification
3. **Better alternatives**: Tools like Aider, Claude Code, and Cursor do this with proper diff algorithms
4. **Architecture mismatch**: Requires full file context, not chunked retrieval

**Alternative**: Use the Context Exporter to gather context, then feed to a dedicated coding assistant.

---

## Summary

| Phase | Feature | Effort | Impact |
|-------|---------|--------|--------|
| 1 | Context Exporter | Low | High |
| 2 | fzf Integration | Low | Medium |
| 2 | Auto-Spawn Watcher | Medium | Medium |
| 3 | Semantic Audit | - | Deferred |
| 3 | Pluggable Parsers | - | Deferred |
| - | Patch Generation | - | Discarded |

**Strategic Focus**: Keep mgrep focused on retrieval excellence. New features should enhance search/discovery, not expand into code modification territory.
