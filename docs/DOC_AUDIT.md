# Documentation Audit: Overlap Analysis

Analysis of duplication across README.md, CLAUDE.md, and AGENTS.md.

## File Sizes

| File | Lines | Purpose |
|------|-------|---------|
| README.md | 559 | Primary documentation, full reference |
| CLAUDE.md | 128 | Claude Code-specific patterns |
| AGENTS.md | 101 | AI Agent workflow guidance |

## Section Inventory

### Duplicated Sections

| Section | README.md | CLAUDE.md | AGENTS.md | Status |
|---------|-----------|-----------|-----------|--------|
| Project Overview | Lines 3-24 | Lines 5-7 | Lines 3-4 | DUPLICATE |
| Commands/Build | Lines 163-243 | Lines 9-35 | Lines 19-25 | DUPLICATE |
| Architecture | Lines 36-98 | Lines 37-60 | Lines 27-31 | DUPLICATE |
| MCP Tools | Lines 247-261 | Lines 109-128 | Lines 42-55 | DUPLICATE |
| Code Style | N/A | Lines 96-101 | Lines 75-78 | DUPLICATE |

### Unique Content by File

#### README.md (Should Keep All)
- C4 Model Architecture diagrams (lines 99-143)
- CLI Commands detailed reference (lines 163-243)
- MCP Resources/Prompts/Annotations (lines 262-451)
- File Filtering section (lines 452-504)
- Testing section (lines 512-545)
- Known Issues (lines 546-550)
- Additional Documentation links (lines 552-558)

#### CLAUDE.md (Unique Content)
- Critical Patterns section (lines 61-87)
  - Factory Pattern (Mandatory)
  - Deterministic Point IDs
  - Path Scoping for Filtering
  - Chunking
  - Sync-on-Demand
  - MCP Server Logging
  - Test Mode
- Adding a New Provider guide (lines 103-107)

#### AGENTS.md (Unique Content)
- Issue Tracking / Beads workflow (lines 6-17)
- MCP Development testing guidance (lines 56-73)
- Landing the Plane / Session Protocol (lines 80-101)

## Content Comparison

### Project Overview

**README.md (22 lines):**
```markdown
**mgrep** is a high-performance CLI-based semantic search and file indexing tool...
### Purpose and Main Functionality
### Key Features and Capabilities
### Likely Intended Use Cases
```

**CLAUDE.md (3 lines):**
```markdown
`mgrep` is a semantic search CLI tool that synchronizes local codebases...
```

**AGENTS.md (2 lines):**
```markdown
`mgrep` is a TypeScript-based CLI tool for semantic code search...
```

**Recommendation:** Keep detailed version in README.md. Other files should reference it.

### Architecture

**README.md:** Complete with Mermaid diagrams, C4 model, technology stack
**CLAUDE.md:** Brief 3-layer description with file references
**AGENTS.md:** Ultra-brief pattern mention

**Recommendation:** README.md is authoritative. CLAUDE.md keeps the quick reference for daily work.

### MCP Tools

**README.md:** Full table with 11 tools + descriptions + Resources/Prompts/Annotations
**CLAUDE.md:** 8 tools listed with parameters
**AGENTS.md:** 8 tools with brief descriptions

**Recommendation:** Keep in README.md only. Add link to README from other files.

### Commands

**README.md:** Full CLI reference with all commands, options, examples
**CLAUDE.md:** Quick command reference for development
**AGENTS.md:** Brief build/test commands

**Recommendation:** README.md is authoritative. CLAUDE.md keeps quick reference.

## Consolidation Plan

### Phase 1: Update File Headers

Add cross-references to README at top of CLAUDE.md and AGENTS.md:

```markdown
> For complete documentation, see [README.md](README.md)
```

### Phase 2: Remove Duplicates from CLAUDE.md

Keep:
- Critical Patterns (unique, valuable for Claude Code)
- Adding a New Provider (unique workflow)
- Quick command reference (development convenience)

Remove:
- Project Overview (duplicate)
- Architecture (simplified duplicate)
- MCP Server Tools (duplicate)

### Phase 3: Remove Duplicates from AGENTS.md

Keep:
- Issue Tracking / Beads (unique)
- MCP Development (unique, just added)
- Session Protocol (unique)

Remove:
- Project Overview (duplicate)
- Architecture Overview (duplicate)
- MCP Integration table (duplicate)

### Phase 4: Add Cross-References

Update remaining sections to link to README for details:
- "See [MCP Tools](README.md#mcp-tools-mgrep) for full API reference"
- "See [Architecture](README.md#architecture) for diagrams"

## Estimated Results

| File | Current | After | Reduction |
|------|---------|-------|-----------|
| README.md | 559 | ~559 | 0% (source of truth) |
| CLAUDE.md | 128 | ~70 | ~45% |
| AGENTS.md | 101 | ~60 | ~40% |

## Success Criteria

- [ ] No content exists in multiple files
- [ ] Each file has clear, unique purpose
- [ ] README.md contains complete reference
- [ ] CLAUDE.md focuses on patterns and quick development
- [ ] AGENTS.md focuses on workflow and session management
- [ ] All cross-references work correctly
