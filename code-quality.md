# Code Quality & Refactoring Analysis

**Analysis Date**: January 2026  
**Scope**: Architecture, documentation, and code patterns based on full source review

---

## Priority 1: High Value Improvements

### cq-004: Automated MCP Integration Testing

**Priority**: High | **Effort**: Medium | **Status**: Ready for implementation

**Problem**: The `docs/MCP_TESTING.md` relies on manual E2E testing via MCP Inspector. This doesn't scale and is error-prone.

**Current State**: Manual checklist for 10+ tools with no automated regression testing.

**Proposed Change**: Implement automated integration tests using the MCP SDK client.

```typescript
// Proposed test structure (src/commands/watch_mcp.test.ts)
import { Client } from "@modelcontextprotocol/sdk/client/index.js";

describe("MCP Tools", () => {
  let client: Client;
  
  beforeAll(async () => {
    // Start MCP server with TestStore (in-memory)
    client = await createTestMCPClient();
  });

  test("mgrep-search returns results", async () => {
    const result = await client.callTool("mgrep-search", { query: "test" });
    expect(result.content).toBeDefined();
  });

  test("mgrep-sync is idempotent", async () => {
    const result1 = await client.callTool("mgrep-sync", {});
    const result2 = await client.callTool("mgrep-sync", {});
    // Verify no duplicate processing
  });
});
```

**Implementation Notes**:
- Use `TestStore` (in-memory) to avoid Qdrant dependency
- Target 80%+ coverage for `watch_mcp.ts` (as stated in README)
- Keep manual checklist for complex edge cases

**Prerequisites**:
- [ ] Create `TestMCPClient` wrapper using `@modelcontextprotocol/sdk`
- [ ] Ensure `TestStore` supports all required operations

---

### cq-003: Documentation DRY Violation

**Priority**: Medium | **Effort**: Small | **Status**: Ready for implementation

**Problem**: Architecture and project overview are duplicated across `README.md`, `CLAUDE.md`, and `AGENTS.md`.

**Current State**: Three files contain nearly identical sections:
- Project Overview (~identical)
- Architecture patterns (Provider Strategy, Factory, etc.)
- MCP Tools listing
- Build/test commands

**Proposed Change**: Consolidate to single source of truth with cross-references.

**Implementation**:
1. Keep `README.md` as comprehensive user/API documentation
2. Reduce `CLAUDE.md` to Claude-specific patterns + reference to README
3. Reduce `AGENTS.md` to agent workflow (beads, session protocol) + reference to README
4. Remove duplicated architecture descriptions from CLAUDE.md and AGENTS.md

**Template for reduced files**:
```markdown
# CLAUDE.md

> For full project documentation, see [README.md](README.md)

## Claude Code Specific Patterns
[Keep only Claude-specific content here]
```

---

## Priority 2: Low Value / Deferred

### cq-002: Makefile Shell Logic Extraction

**Priority**: Low | **Effort**: Trivial | **Status**: Deferred

**Problem**: The `_generate-config` target contains ~45 lines of embedded shell script.

**Current State**: Interactive configuration using `read`, `case`, and `printf` in Makefile.

**Recommendation**: Consider these alternatives in priority order:
1. **Best**: Create `mgrep init` CLI command using `@clack/prompts` (already a dependency)
2. **Acceptable**: Extract to `scripts/generate-config.sh`

**Rationale for Deferral**: Works fine as-is. Only refactor if adding new configuration options.

---

### cq-006: Symbol Extractor Language Extensibility

**Priority**: Low | **Effort**: Medium | **Status**: Deferred

**Problem**: Adding new languages requires modifying `src/lib/symbol-extractor.ts`.

**Current State**: Language patterns are defined as `PatternDefinition[]` arrays (TS_PATTERNS, PY_PATTERNS, GO_PATTERNS).

**Recommendation**: The current structure is already reasonably modular:
- Each language has its own pattern array
- Adding a language means: create array, add to switch statement

**When to Revisit**: If 2+ additional languages are requested, consider:
- Moving patterns to `src/lib/languages/*.ts` files
- Creating a registry/plugin pattern

**Rationale for Deferral**: Only 4 languages supported; covers ~90% of use cases. Premature abstraction.

---

## Discarded Recommendations

The following items from the original analysis were **discarded** after code review:

### ~~cq-001: Fragile Regex-based Symbol Extraction~~ ❌

**Why Discarded**: This is an **intentional, documented design decision**.

The `docs/SYMBOL_SEARCH_DESIGN.md` explicitly explains the choice of regex over AST:
- **Simplicity**: No language-specific parser dependencies
- **Performance**: Regex is fast for large codebases  
- **Consistency**: Follows patterns from ctags, ripgrep
- **Sufficient Accuracy**: For definition detection, regex is highly accurate

The recommendation to use tree-sitter would add significant complexity (native bindings, build requirements) with minimal benefit for the use case.

---

### ~~cq-005: Custom REST Clients for Anthropic/Google~~ ❌

**Why Discarded**: This is a **conscious design tradeoff**, not technical debt.

**Evidence from code review**:
- `src/lib/providers/llm/anthropic.ts`: 83 lines, simple fetch wrapper
- `src/lib/providers/llm/google.ts`: 105 lines, simple fetch wrapper
- Both implementations are stable and handle the core use case (chat completion)

**Benefits of current approach**:
- Full control over timeouts, abort signals, request format
- No SDK version upgrade churn
- Smaller bundle size
- OpenAI SDK is used because it also enables Ollama support (same client, different base URL)

**When to revisit**: Only if streaming support becomes mandatory (currently optional in `LLMClient` interface).

---

## Summary

| ID | Title | Verdict | Priority | Effort |
|----|-------|---------|----------|--------|
| cq-004 | Automated MCP Testing | ✅ Implement | High | Medium |
| cq-003 | Documentation DRY | ✅ Implement | Medium | Small |
| cq-002 | Makefile Shell Logic | 🔄 Defer | Low | Trivial |
| cq-006 | Symbol Extractor Extensibility | 🔄 Defer | Low | Medium |
| cq-001 | Regex Symbol Extraction | ❌ Discard | - | - |
| cq-005 | Custom REST Clients | ❌ Discard | - | - |

**Recommended Implementation Order**:
1. cq-004: MCP automated testing (highest risk reduction)
2. cq-003: Documentation consolidation (quick win)
3. cq-002/cq-006: Address opportunistically when touching related code

---

## Appendix: Original Analysis Context

The original analysis was performed without access to source code, relying only on documentation and configuration files. This updated analysis incorporates findings from:
- Full review of `src/lib/symbol-extractor.ts` (657 lines)
- Review of LLM providers (`anthropic.ts`, `google.ts`, `openai.ts`)
- Review of `docs/SYMBOL_SEARCH_DESIGN.md` design document
- Comparison of `README.md`, `CLAUDE.md`, `AGENTS.md` content
- `package.json` dependency analysis
