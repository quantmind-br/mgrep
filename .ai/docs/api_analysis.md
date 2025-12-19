# API Documentation

This document provides a comprehensive overview of the APIs exposed and consumed by `mgrep`, a semantic grep-like search tool.

## APIs Served by This Project

`mgrep` primarily serves as a CLI tool, but it also exposes interfaces for AI agents through the Model Context Protocol (MCP) and a Claude Plugin.

### CLI Interface

The CLI is the primary entry point for users and AI agents.

#### 1. Semantic Search
- **Command**: `mgrep search <pattern> [path]`
- **Description**: Performs a semantic search over indexed files using vector embeddings.
- **Arguments**:
    - `pattern`: The natural language query or pattern to search for.
    - `path` (optional): The directory to search in (defaults to current directory).
- **Options**:
    - `-i`: Case-insensitive search (note: semantic search is inherently case-insensitive).
    - `-r`: Recursive search.
    - `-m, --max-count <n>`: Maximum number of results to return (default: 10).
    - `-c, --content`: Show the content of the matching chunks.
    - `-s, --sync`: Sync local files to the store before searching.
    - `--no-rerank`: Disable reranking of search results.
- **Response**: A list of matching file paths, line ranges, and match percentages.

#### 2. AI-Generated Answers (RAG)
- **Command**: `mgrep -a <question> [path]`
- **Description**: Uses Retrieval-Augmented Generation (RAG) to answer questions based on the local codebase.
- **Arguments**:
    - `question`: The question to answer.
- **Response**: An AI-generated answer with citations to the source files.

#### 3. Background Synchronization
- **Command**: `mgrep watch`
- **Description**: Starts a background process that watches for file changes and updates the vector store in real-time.
- **Options**:
    - `-d, --dry-run`: Show what would be synced without performing actual updates.
    - `--max-file-size <bytes>`: Limit the size of files to be indexed.

### Model Context Protocol (MCP) Server

`mgrep` implements an MCP server to allow AI agents (like Claude Desktop) to interact with the tool programmatically.

- **Command**: `mgrep mcp`
- **Transport**: Standard Input/Output (Stdio).
- **Capabilities**:
    - `tools`: Currently a skeleton implementation (tools are being defined).
- **Background Sync**: Automatically starts a file sync process in the background when the MCP server initializes.

### Claude Plugin

`mgrep` includes a Claude-specific plugin configuration.

- **Location**: `plugins/mgrep/`
- **Skill**: Defined in `SKILL.md`, providing instructions to Claude on how to use `mgrep` for local file searches.
- **Hooks**:
    - `SessionStart`: Automatically triggers `mgrep watch` via a Python wrapper (`mgrep_watch.py`).
    - `SessionEnd`: Kills the background watch process (`mgrep_watch_kill.py`).

---

## Authentication & Security

`mgrep` handles authentication through configuration files and environment variables.

- **Configuration Files**: `.mgreprc.yaml` (local) or `~/.config/mgrep/config.yaml` (global).
- **Environment Variables**:
    - `MGREP_QDRANT_API_KEY`: API key for the Qdrant vector database.
    - `MGREP_OPENAI_API_KEY`: API key for OpenAI services.
    - `MGREP_GOOGLE_API_KEY`: API key for Google Generative AI.
    - `MGREP_ANTHROPIC_API_KEY`: API key for Anthropic (Claude).
- **Security Considerations**:
    - API keys are passed to external providers via HTTPS.
    - Local file content is sent to embedding providers for indexing.
    - The tool respects `.gitignore` and `.mgrepignore` patterns to prevent sensitive files from being indexed.

---

## Rate Limiting & Constraints

- **Concurrency**: The file synchronization process uses a configurable concurrency limit (default: 20) to avoid overwhelming the local system or the vector database.
- **File Size**: Files exceeding `maxFileSize` (default: 10MB) are skipped during indexing.
- **Batching**: Embeddings are generated in batches (default: 100) to optimize API usage and performance.

---

## External API Dependencies

`mgrep` integrates with several external services for vector storage and AI capabilities.

### Services Consumed

| Service Name | Purpose | Configuration | Endpoints Used |
| :--- | :--- | :--- | :--- |
| **Qdrant** | Vector Database | `qdrant.url`, `qdrant.apiKey` | `/collections`, `/points/search`, `/points/upsert`, `/points/delete` |
| **OpenAI** | Embeddings & LLM | `embeddings.apiKey`, `llm.apiKey` | `/v1/embeddings`, `/v1/chat/completions` |
| **Google AI** | Embeddings & LLM | `embeddings.apiKey`, `llm.apiKey` | Google Generative AI SDK endpoints |
| **Anthropic** | LLM (Claude) | `llm.apiKey` | Anthropic SDK endpoints |
| **Ollama** | Local AI | `baseUrl` | OpenAI-compatible local endpoints |

### Integration Patterns

- **Deterministic Point IDs**: `mgrep` generates UUID-like strings for Qdrant point IDs using SHA256 hashes of the file path and chunk index. This ensures that re-indexing the same file updates existing entries instead of creating duplicates.
- **Path Scoping**: For efficient directory-based filtering, `mgrep` generates "path scopes" (e.g., `/src/lib/file.ts` -> `["/src", "/src/lib", "/src/lib/file.ts"]`) and stores them as a keyword payload in Qdrant.
- **Retry Mechanism**: All AI provider clients implement a retry logic with a configurable `maxRetries` (default: 3) and `timeoutMs`.

---

## Available Documentation

- **README.md**: General overview and installation instructions.
- **PLAN.md**: Development roadmap and upcoming features.
- **CLAUDE.md**: Specific instructions for Claude integration.
- **SKILL.md**: Documentation for the `mgrep` skill used by AI agents.
- **.ai/docs/**: Internal analysis documents covering data flow, dependencies, and structure.

### Documentation Quality
The project maintains high-quality internal documentation in the `.ai/docs/` directory, which provides deep technical insights into the system's architecture. The user-facing documentation (README and SKILL.md) is practical and focused on immediate utility.