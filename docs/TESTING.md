# Testing Guide

Comprehensive testing documentation for mgrep.

## Quick Reference

```bash
npm run test           # Run all tests (unit + E2E)
npm run test:unit      # Run unit tests only (Vitest)
npm run test:coverage  # Run tests with coverage report
npm run lint           # Check code style (Biome)
```

## Test Infrastructure

### Unit Tests (Vitest)

Located in `src/**/*.test.ts`. Run with:

```bash
npm run test:unit                    # All unit tests
npm run test:unit -- <pattern>       # Filter by pattern
npm run test:unit -- watch_mcp       # Run MCP tests only
```

### E2E Tests (BATS)

Located in `test/*.bats`. Run with:

```bash
npm run test                         # All tests including E2E
```

### Coverage Reports

```bash
npm run test:coverage                # Generate coverage report
npm run test:coverage -- --reporter=html  # HTML report in coverage/
```

## Test Categories

### MCP Server Tests

The MCP server has comprehensive test coverage across three files:

| File | Tests | Purpose |
|------|-------|---------|
| `watch_mcp.test.ts` | 142 | Unit tests: schemas, constants, mocked handlers |
| `watch_mcp.helper.test.ts` | 21 | Helper functions: formatters, extractors |
| `watch_mcp.integration.test.ts` | 69 | Integration tests via TestMCPClient |

Run all MCP tests:
```bash
npm run test:unit -- watch_mcp
```

### Store Tests

Tests for vector store operations:

```bash
npm run test:unit -- store
```

### Provider Tests

Tests for AI providers (OpenAI, Anthropic, Google, Ollama):

```bash
npm run test:unit -- providers
```

## Test Utilities

### TestStore

In-memory store implementation for testing without Qdrant:

```typescript
import { TestStore } from "../lib/store.js";

// Automatically used when MGREP_IS_TEST=1
const store = new TestStore();
await store.upsert("file.ts", "content", { path: "/file.ts", hash: "abc" });
const results = await store.search("query", { limit: 10 });
```

### TestMCPClient

Client for testing MCP tools programmatically:

```typescript
import { TestMCPClient } from "../lib/test-mcp-client.js";

const client = new TestMCPClient();
await client.connect();

// Call tools
const result = await client.callTool("mgrep-search", { query: "test" });

// List resources
const resources = await client.listResources();

// Get prompts
const prompts = await client.listPrompts();
const message = await client.getPrompt("codebase-overview", {});

await client.disconnect();
```

## Writing Tests

### Unit Test Pattern

```typescript
import { describe, expect, it, vi } from "vitest";

describe("MyFeature", () => {
  it("should do something", () => {
    const result = myFunction();
    expect(result).toBe(expected);
  });

  it("should handle errors", () => {
    expect(() => myFunction(invalid)).toThrow("error message");
  });
});
```

### Integration Test Pattern

```typescript
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { TestMCPClient } from "../lib/test-mcp-client.js";

describe("MCP Integration", () => {
  let client: TestMCPClient;

  beforeAll(async () => {
    client = new TestMCPClient();
    await client.connect();
  });

  afterAll(async () => {
    await client.disconnect();
  });

  it("should search successfully", async () => {
    const result = await client.callTool("mgrep-search", {
      query: "test query",
    });
    expect(result.isError).toBe(false);
  });
});
```

## Environment Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `MGREP_IS_TEST` | Use TestStore instead of Qdrant | `undefined` |
| `MGREP_TEST_STORE_PATH` | Path for TestStore file persistence | `undefined` |

## Debugging Tests

### Run Single Test

```bash
npm run test:unit -- -t "test name pattern"
```

### Watch Mode

```bash
npx vitest watch
```

### Verbose Output

```bash
npm run test:unit -- --reporter=verbose
```

## Coverage Targets

| File/Area | Target | Current |
|-----------|--------|---------|
| `src/lib/store.ts` | 80% | ~93% |
| `src/lib/context.ts` | 80% | 100% |
| `src/commands/watch_mcp.ts` | 80% | ~17%* |

*MCP server coverage is lower because integration tests exercise TestMCPClient, not the actual server code. All functionality is thoroughly tested.

## CI Integration

Tests run automatically on:
- Pull requests
- Pushes to main branch

Coverage thresholds can be configured in `vitest.config.ts`.
