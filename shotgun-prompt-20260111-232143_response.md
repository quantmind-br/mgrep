# mgrep UI/UX Improvement Plan

> **Analysis Date**: 2026-01-11
> **Status**: Reviewed and prioritized for implementation

## Implementation Phases

### Phase 1: Quick Wins (Trivial/Small Effort)

#### 1. Actionable Empty States for Search
**ID**: uiux-005 | **Priority**: High | **Effort**: Small

Provide helpful guidance when search returns zero results instead of generic messages.

**Current State**: Returns "No results found." with no guidance.

**Implementation**:
- If store is empty: `"No files indexed. Run 'mgrep sync' first."`
- If store has data but 0 results: 
  ```
  No matches found. Try:
    - Broaden your query
    - Remove path filters  
    - Run 'mgrep stats' to check indexed file count
  ```

**Affected Files**: `src/commands/search.ts`, `src/commands/watch_mcp.ts`

---

#### 2. Verify NO_COLOR Standard Compliance
**ID**: uiux-004 | **Priority**: Medium | **Effort**: Trivial

Ensure accessibility compliance for users with specific terminal needs or CI/CD pipelines.

**Current State**: `chalk` v5 automatically respects `NO_COLOR`. Need to verify `ora` spinner behavior.

**Implementation**:
- Verify chalk's automatic handling works correctly
- Check `ora` spinner respects NO_COLOR or add explicit check
- Document support in README

**Affected Files**: Verification only; possible minor update to `src/lib/sync-helpers.ts`

---

#### 3. Minor MCP Description Enhancements  
**ID**: uiux-008 | **Priority**: Low | **Effort**: Trivial

Add path examples to parameter descriptions (current descriptions are already high-quality).

**Current State**: Good descriptions with semantic context and constraints. Missing inline examples for `path` parameters.

**Implementation**:
- Add example format to path-related parameters: `"Filter by path prefix (e.g., 'src/lib')"`
- Already done for most parameters; verify consistency

**Affected Files**: `src/commands/watch_mcp.ts` (minor edits to inputSchema descriptions)

---

### Phase 2: Core UX Improvements (Medium Effort)

#### 4. Native CLI Init Command
**ID**: uiux-001 | **Priority**: High | **Effort**: Medium

Replace Makefile-based configuration with a cross-platform TypeScript CLI command.

**Current State**: `make init-config` uses shell scripts with `read` prompts, incompatible with Windows.

**Implementation**:
- Create `src/commands/init.ts` using `@clack/prompts` (already in dependencies)
- Interactive provider selection (OpenAI, Google, Anthropic, Ollama)
- API key input with basic validation
- Config file generation at `~/.config/mgrep/config.yaml`
- Support `--reconfigure` flag for re-running setup

**User Benefit**: Seamless cross-platform onboarding experience.

**Affected Files**: 
- New: `src/commands/init.ts`
- Update: `src/index.ts` (register command)
- Optional: Keep Makefile as convenience wrapper

---

#### 5. Native Interactive Fallback for fzf
**ID**: uiux-003 | **Priority**: Medium | **Effort**: Medium

Provide Node.js-native selection when `fzf` binary is unavailable.

**Current State**: Silently returns `null` if fzf is missing. `FzfPipe.isAvailable()` exists but is never called.

**Implementation**:
- Call `FzfPipe.isAvailable()` before spawning fzf
- If unavailable:
  1. Warn user: `"fzf not found. Using built-in selector (install fzf for better experience)"`
  2. Fall back to `@clack/prompts` select with top 20 results
- Add pagination hint if results exceed display limit

**User Benefit**: Interactive workflow works for all users regardless of fzf installation.

**Affected Files**: `src/commands/search.ts`, `src/lib/fzf-pipe.ts`

---

### Phase 3: Polish (Lower Priority - Await User Feedback)

#### 6. Syntax Highlighting for Search Results
**ID**: uiux-002 | **Priority**: Low | **Effort**: Small

Add optional code highlighting when displaying file content in search results.

**Current State**: Plain text display of code snippets.

**Adjusted Scope**: 
- Only apply when `--content` flag is used
- Make opt-in via `--highlight` flag (not default)
- Consider deferring until user feedback requests this feature

**Implementation Notes**:
- Use `cli-highlight` library
- Respect NO_COLOR environment variable
- Detect language from file extension

**Affected Files**: `src/commands/search.ts`

---

#### 7. Enhanced Sync Progress (Minor)
**ID**: uiux-006 | **Priority**: Low | **Effort**: Trivial

**Note**: Current implementation already provides good progress feedback via `ora` spinner with real-time file counts and paths.

**Minor Enhancement**:
- Add ETA calculation based on average processing time
- Optional: Show phase labels ("Discovering files...", "Indexing...")

**Affected Files**: `src/lib/sync-helpers.ts`

---

### Deferred Features

#### Symbol Search Visual Formatting
**ID**: uiux-007 | **Status**: Deferred

**Reason**: Premature optimization. Symbol search feature needs proven adoption before investing in visual polish.

**When to Revisit**: After collecting user feedback on symbol search usage patterns.

**Implementation Notes** (for future):
- Use ASCII-safe icons with Unicode upgrade for capable terminals
- Respect NO_COLOR for plain output mode
- Format: `fn createStore()`, `cls QdrantStore`, `iface Store`

---

## Summary Statistics

| Phase | Features | Estimated Effort |
|-------|----------|------------------|
| Phase 1 (Quick Wins) | 3 | Trivial-Small |
| Phase 2 (Core UX) | 2 | Medium |
| Phase 3 (Polish) | 2 | Small-Trivial |
| Deferred | 1 | - |

## Dependencies

- `@clack/prompts` - Already installed (^0.11.0), not yet used in codebase
- `cli-highlight` - Would need to be added for Phase 3 syntax highlighting

## Notes from Analysis

1. **Sync progress** (uiux-006) is already well-implemented with `ora` spinner and `onProgress` callback
2. **MCP descriptions** (uiux-008) are already high-quality with semantic context and annotations
3. **chalk** v5 automatically handles NO_COLOR - verification needed, not implementation
4. Focus on **cross-platform UX** (init, fzf fallback) for maximum user impact
