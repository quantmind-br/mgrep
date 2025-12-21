# API Documentation

## APIs Served by This Project

This project primarily exposes functionality via the **Model Context Protocol (MCP)**, allowing AI agents (like Claude Desktop or other MCP clients) to perform semantic searches over local codebases and the web.

### MCP Tools (mgrep)
The main `mgrep` service exposes an MCP server that provides semantic search and RAG (Retrieval-Augmented Generation) capabilities.

**Transport**: Stdio (Standard Input/Output)  
**Entry Point**: `mgrep mcp`

#### `mgrep-search`
- **Method**: MCP Tool Call
- **Description**: Semantic search over indexed local files. Finds code and documentation based on meaning and intent.
- **Request Parameters**:
  - `query` (string, required): Natural language search query.
  - `path` (string, optional): Path filter to search within a specific directory.
  - `max_results` (number, optional, default: 10): Maximum results to return.
  - `include_content` (boolean, optional, default: false): Whether to include the actual file content in results.
  - `rerank` (boolean, optional, default: true): Enable reranking for better result quality.
- **Response**: A formatted string containing matching file paths, line ranges, and relevance scores.

#### `mgrep-ask`
- **Method**: MCP Tool Call
- **Description**: Ask questions about the codebase and get AI-generated answers with citations (RAG).
- **Request Parameters**:
  - `question` (string, required): Question to answer about the codebase.
  - `path` (string, optional): Path filter to limit search scope.
  - `max_results` (number, optional, default: 10): Number of source chunks to consider.
  - `rerank` (boolean, optional, default: true): Enable reranking for better context quality.
- **Response**: AI-generated answer with citations and a list of sources used.

#### `mgrep-web-search`
- **Method**: MCP Tool Call
- **Description**: Search the web using Tavily AI.
- **Request Parameters**:
  - `query` (string, required): Web search query.
  - `max_results` (number, optional, default: 10): Maximum results to return.
  - `include_content` (boolean, optional, default: true): Include full content snippets for each result.
- **Response**: List of web results with titles, URLs, and snippets.

#### `mgrep-sync`
- **Method**: MCP Tool Call
- **Description**: Synchronize local files with the vector store (Qdrant).
- **Request Parameters**:
  - `dry_run` (boolean, optional, default: false): If true, only show what would be synced.
- **Response**: Summary of the synchronization process (files uploaded/deleted/skipped).

### MCP Tools (tavily-mcp)
A separate, specialized MCP server located in `/tavily-mcp` provides direct and advanced access to Tavily APIs.

**Entry Point**: `node tavily-mcp/dist/index.js`

- **Tools**:
  - `tavily-search`: Comprehensive web search with filters (topic, time range, domains).
  - `tavily-extract`: Extract clean content from a list of URLs.
  - `tavily-crawl`: Crawl a base URL and find sub-pages.
  - `tavily-map`: List all sub-pages for a given domain.

---

### Authentication & Security
- **Local Context**: The MCP server runs as a local process. Security is inherited from the host machine's environment.
- **API Keys**: External service keys (OpenAI, Anthropic, Google, Tavily) are managed via:
  - Environment variables (e.g., `MGREP_LLM_API_KEY`, `OPENAI_API_KEY`).
  - Configuration files (`.mgreprc.yaml` or `~/.config/mgrep/config.yaml`).
- **Communication**: MCP uses JSON-RPC over stdio, which is secure as it only allows communication between the local client and the server process.

### Rate Limiting & Constraints
- **Concurrency**: File synchronization concurrency is configurable via `sync.concurrency` (default: 20).
- **File Size**: Maximum file size for indexing is configurable via `maxFileSize` (default: 10MB).
- **Provider Limits**: Subject to the rate limits of the configured AI providers (OpenAI, Google, etc.).

---

## External API Dependencies

### Services Consumed

#### Qdrant (Vector Database)
- **Purpose**: Storage and retrieval of text embeddings for semantic search.
- **Configuration**: URL (`MGREP_QDRANT_URL`) and optional API key.
- **Integration**: Uses `@qdrant/js-client-rest`.
- **Error Handling**: Retries are handled at the transport level; the application validates collection existence before operations.

#### LLM Providers (OpenAI, Anthropic, Google, Ollama)
- **Purpose**: Generating answers for `mgrep-ask` and reranking search results.
- **Endpoints**:
  - OpenAI: `POST /v1/chat/completions`
  - Anthropic: `POST /v1/messages`
  - Google: Gemini API (Generative Language)
  - Ollama: OpenAI-compatible chat endpoint.
- **Authentication**: Bearer Token / API Key.
- **Resilience**: Configurable `timeoutMs` (default: 60s) and `maxRetries` (default: 3).

#### Embeddings Providers (OpenAI, Google, Ollama)
- **Purpose**: Converting text chunks into vector representations.
- **Endpoints**:
  - OpenAI: `POST /v1/embeddings`
  - Google: `POST /v1beta/models/{model}:embedContent`
- **Integration**: OpenAI SDK for OpenAI/Ollama; Native `fetch` for Google.
- **Resilience**: Configurable `batchSize` (default: 100), `timeoutMs` (default: 30s), and `maxRetries` (default: 3).

#### Tavily AI
- **Purpose**: Web search capabilities.
- **Base URL**: `https://api.tavily.com`
- **Endpoints Used**: `/search`, `/extract`, `/crawl`, `/map`.
- **Authentication**: API Key via `X-API-KEY` or Bearer token.

---

### Integration Patterns
- **Provider Factory**: The project uses a factory pattern (`createLLMClient`, `createEmbeddingsClient`) to abstract away different AI providers under a common interface (`LLMClient`, `EmbeddingsClient`).
- **Standardized Configuration**: All external integrations share a similar configuration structure (provider, model, apiKey, baseUrl, timeout, retries).
- **Zod Validation**: Configuration and API responses (where critical) are validated using Zod schemas to ensure type safety and contract adherence.

---

## Available Documentation

| Document | Path | Description |
| :--- | :--- | :--- |
| **API Analysis** | `.ai/docs/api_analysis.md` | Deep dive into internal API structures. |
| **Project Overview** | `README.md` | General usage and installation instructions. |
| **MCP Integration** | `src/commands/watch_mcp.ts` | Source code for MCP tool definitions and handlers. |
| **Config Schema** | `src/lib/config.ts` | Detailed Zod schemas for all configuration options. |
| **Skill Definition** | `plugins/mgrep/skills/mgrep/SKILL.md` | Documentation for Claude-specific skill integration. |

**Documentation Quality Evaluation**:  
The documentation is **high quality** and **developer-centric**. The inclusion of Zod schemas for configuration and clear MCP tool definitions makes integration straightforward. The project also provides an `.mgreprc.yaml.example` which serves as a practical reference for API configuration.