# API Documentation

This document provides a comprehensive overview of the APIs exposed and consumed by `mgrep`, a semantic search tool designed for local codebases and AI agent integration.

## APIs Served by This Project

`mgrep` primarily serves as a CLI tool but also exposes programmatic interfaces for AI agents through the Model Context Protocol (MCP) and a Claude Plugin.

### CLI Interface

The CLI is the primary entry point for users and AI agents.

#### 1. Semantic Search
- **Command**: `mgrep search <pattern> [path]`
- **Description**: Performs a semantic search over indexed files using vector embeddings.
- **Arguments**:
    - `pattern`: The natural language query or pattern to search for.
    - `path` (optional): The directory to search in (defaults to current directory).
- **Options**:
    - `-i`: Case-insensitive search (semantic search is inherently case-insensitive).
    - `-r`: Recursive search.
    - `-m, --max-count <n>`: Maximum number of results to return (default: 10).
    - `-c, --content`: Show the content of the matching chunks.
    - `-s, --sync`: Sync local files to the store before searching.
    - `-a, --answer`: Generate an AI answer (RAG) based on the search results.
    - `--no-rerank`: Disable reranking of search results.
- **Response**: A list of matching file paths, line ranges, and match percentages, or an AI-generated answer with citations.

#### 2. Background Synchronization
- **Command**: `mgrep watch`
- **Description**: Starts a background process that watches for file changes and updates the vector store in real-time.
- **Options**:
    - `-d, --dry-run`: Show what would be synced without performing actual updates.
    - `--max-file-size <bytes>`: Limit the size of files to be indexed (default: 10MB).

### Model Context Protocol (MCP) Server

`mgrep` implements an MCP server to allow AI agents (like Claude Desktop) to interact with the tool programmatically.

- **Command**: `mgrep mcp`
- **Transport**: Standard Input/Output (Stdio).
- **Capabilities**:
    - `tools`: Currently a skeleton implementation (tools are being defined).
- **Behavior**: Automatically starts a file sync process in the background when the MCP server initializes.

### Claude Plugin

`mgrep` includes a Claude-specific plugin configuration for seamless integration with Claude Code and other Claude-based tools.

- **Location**: `plugins/mgrep/`
- **Hooks**:
    - `SessionStart`: Triggers `mgrep watch` via `mgrep_watch.py`.
    - `SessionEnd`: Kills the background watch process via `mgrep_watch_kill.py`.

---

## Authentication & Security

### Authentication Flow
`mgrep` handles authentication through configuration files and environment variables.

- **Configuration Files**: 
    - Local: `.mgreprc.yaml` or `.mgreprc.yml` in the project root.
    - Global: `~/.config/mgrep/config.yaml` or `~/.config/mgrep/config.yml`.
- **Environment Variables**:
    - `MGREP_QDRANT_API_KEY`: API key for the Qdrant vector database.
    - `MGREP_OPENAI_API_KEY`: API key for OpenAI services.
    - `MGREP_GOOGLE_API_KEY`: API key for Google Generative AI.
    - `MGREP_ANTHROPIC_API_KEY`: API key for Anthropic (Claude).
    - `MGREP_QDRANT_URL`: URL for the Qdrant instance (default: `http://localhost:6333`).

### Security Considerations
- **Data Privacy**: Local file content is sent to the configured embedding provider (e.g., OpenAI, Google) for indexing.
- **Exclusion Patterns**: The tool respects `.gitignore` and internal `DEFAULT_IGNORE_PATTERNS` to prevent sensitive files (like `.env`, `.git`, `node_modules`) from being indexed.
- **Transport Security**: All external API calls are made over HTTPS.

---

## Rate Limiting & Constraints

- **Concurrency**: The file synchronization process uses a configurable concurrency limit (default: 20) to manage system load and API rate limits.
- **File Size**: Files exceeding `maxFileSize` (default: 10MB) are skipped during indexing.
- **Batching**: Embeddings are generated in batches (default: 100) to optimize API usage.
- **Timeouts**: 
    - Embeddings: 30 seconds (default).
    - LLM: 60 seconds (default).

---

## External API Dependencies

`mgrep` integrates with several external services for vector storage and AI capabilities.

### Services Consumed

| Service Name | Purpose | Configuration | Endpoints Used |
| :--- | :--- | :--- | :--- |
| **Qdrant** | Vector Database | `qdrant.url`, `qdrant.apiKey` | `/collections`, `/points/search`, `/points/upsert`, `/points/delete`, `/points/scroll` |
| **OpenAI** | Embeddings & LLM | `embeddings.apiKey`, `llm.apiKey` | `/v1/embeddings`, `/v1/chat/completions` |
| **Google AI** | Embeddings & LLM | `embeddings.apiKey`, `llm.apiKey` | `/v1beta/models/...:embedContent`, `/v1beta/models/...:generateContent` |
| **Anthropic** | LLM (Claude) | `llm.apiKey` | `/v1/messages` |
| **Ollama** | Local AI | `baseUrl` | OpenAI-compatible local endpoints |

### Integration Patterns

- **Deterministic Point IDs**: Generates UUID-like strings for Qdrant point IDs using SHA256 hashes of the file path and chunk index, ensuring idempotent updates.
- **Path Scoping**: Generates "path scopes" (e.g., `/src/lib/file.ts` -> `["/src", "/src/lib", "/src/lib/file.ts"]`) stored as keyword payloads in Qdrant for efficient directory-based filtering.
- **Retry Mechanism**: Implements a retry logic with a configurable `maxRetries` (default: 3) for all AI provider clients.
- **Provider Abstraction**: Uses a vendor-neutral `Store` and `EmbeddingsClient`/`LLMClient` interface to support multiple backends.

---

## Available Documentation

- **README.md**: General overview, installation, and CLI usage.
- **CLAUDE.md**: Specific instructions for Claude integration.
- **SKILL.md**: Documentation for the `mgrep` skill used by AI agents.
- **.ai/docs/**: Internal technical analysis documents:
    - `api_analysis.md`: Detailed API overview.
    - `data_flow_analysis.md`: Tracing data from files to vector store.
    - `dependency_analysis.md`: External library and service dependencies.
    - `request_flow_analysis.md`: Detailed request/response flows.
    - `structure_analysis.md`: Codebase architecture and organization.

### Documentation Quality
The project maintains high-quality, AI-readable documentation in the `.ai/docs/` directory, providing deep technical insights. User-facing documentation is practical and focused on immediate utility for both humans and AI agents.