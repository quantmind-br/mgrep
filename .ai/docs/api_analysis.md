# API Analysis

## Project Type
This is a semantic search CLI tool and library that also functions as a **Model Context Protocol (MCP)** server. It enables AI agents and humans to perform semantic searches, RAG-based question answering, and web searches over local files and the internet.

## Endpoints Overview
The project does not expose a traditional REST/HTTP API. Instead, it provides an **MCP Server** interface (JSON-RPC over Stdio) and a **CLI** interface.

### MCP Tools (JSON-RPC)
The MCP server exposes the following tools for AI agents:
- `mgrep-search`: Semantic search over indexed local files.
- `mgrep-ask`: RAG-based question answering about the codebase.
- `mgrep-web-search`: Web search using Tavily AI.
- `mgrep-sync`: Synchronize local files with the vector store.
- `mgrep-get-file`: Retrieve file content with optional line ranges.
- `mgrep-list-files`: List indexed files with pagination.
- `mgrep-get-context`: Get code context around a specific line.
- `mgrep-stats`: Get statistics about the indexed store.

### CLI Commands
- `mgrep search [pattern] [path]`: Default command for semantic search.
- `mgrep watch`: Watches for file changes and syncs them to the store.
- `mgrep mcp`: Starts the MCP server.
- `mgrep install-*`: Helper commands for IDE/Agent integrations.

## Authentication
Authentication is managed via API keys for various providers, configured through environment variables or a YAML configuration file (`.mgreprc.yaml`).
- **Required Keys**: `MGREP_OPENAI_API_KEY`, `MGREP_TAVILY_API_KEY`, `MGREP_ANTHROPIC_API_KEY`, `MGREP_GOOGLE_API_KEY`, or `MGREP_QDRANT_API_KEY` (depending on the provider used).
- **Environment Variables**: Prefixed with `MGREP_` (e.g., `MGREP_STORE`, `MGREP_SYNC`).

## Detailed Endpoints (MCP Tools)

### Tool: `mgrep-search`
- **Description**: Performs a semantic search over indexed local files.
- **Parameters**:
  - `query` (string, required): Natural language search query.
  - `path` (string, optional): Directory filter.
  - `max_results` (number, optional, default: 10): Limit of results (max 50).
  - `include_content` (boolean, optional, default: false): Whether to return the file content.
  - `rerank` (boolean, optional, default: true): Enable reranking for quality.
- **Response**: String containing matched file paths, line numbers, scores, and optionally content.

### Tool: `mgrep-ask`
- **Description**: RAG-based question answering about the codebase.
- **Parameters**:
  - `question` (string, required): Question to answer.
  - `path` (string, optional): Scope filter.
  - `max_results` (number, optional, default: 10): Number of source chunks to consider.
  - `rerank` (boolean, optional, default: true): Enable reranking.
- **Response**: AI-generated answer with citations and source list.

### Tool: `mgrep-web-search`
- **Description**: Search the web using Tavily.
- **Parameters**:
  - `query` (string, required): Web search query.
  - `max_results` (number, optional, default: 10): Max results (max 20).
  - `include_content` (boolean, optional, default: true): Include content snippets.
- **Response**: List of URLs and content snippets.

### Tool: `mgrep-get-file`
- **Description**: Retrieve specific file content.
- **Parameters**:
  - `path` (string, required): Path to the file.
  - `start_line` (number, optional): Starting line (1-indexed).
  - `end_line` (number, optional): Ending line (inclusive).
- **Response**: File content or specified line range.

### Tool: `mgrep-list-files`
- **Description**: Explore the indexed codebase structure.
- **Parameters**:
  - `path_prefix` (string, optional): Filter by path.
  - `limit` (number, optional, default: 50): Pagination limit.
  - `offset` (number, optional, default: 0): Pagination offset.
  - `include_hash` (boolean, optional): Include file SHA256 hashes.

## Programmatic API
The project exports several TypeScript interfaces and classes for use as a library.

### `Store` Interface
Main interface for vector store operations:
- `search(storeIds, query, top_k, options, filters)`: Semantic search.
- `ask(storeIds, question, top_k, options, filters)`: RAG answering.
- `uploadFile(storeId, file, options)`: Index a file.
- `deleteFile(storeId, externalId)`: Remove a file.
- `listFiles(storeId, options)`: List indexed files.
- `getInfo(storeId)`: Get store status and counts.

### `MgrepConfig` Interface
Defines the structure for configuration including `qdrant`, `embeddings`, `llm`, `sync`, and `tavily` settings.

## Common Patterns
- **Sync-on-Demand**: Files are synchronized using SHA256 hashes to detect changes.
- **Deterministic IDs**: Qdrant point IDs are generated from file path hashes.
- **Stdio Transport**: The MCP server communicates via stdin/stdout, while logging is redirected to stderr.
- **Path Filtering**: Most search/list tools support `path` or `path_prefix` filters for directory-specific operations.