# Data Flow Analysis

## Data Models

The system uses several core data structures to manage the lifecycle of information from ingestion to retrieval:

*   **MgrepConfig**: A validated configuration object (using Zod) that defines provider settings (OpenAI, Google, Anthropic, Ollama), Qdrant connection details, and synchronization parameters.
*   **FileMetadata**: Tracks individual file identity and state, including the relative `path`, a SHA256 `hash` of content, file `size`, and modification time (`mtimeMs`).
*   **ChunkType**: The atomic unit of searchable data. It exists in various forms:
    *   **TextChunk**: Contains a segment of text, its line range (`start_line`, `num_lines`), and a relevance `score`.
    *   **Media Chunks**: `ImageURLChunk`, `AudioURLChunk`, and `VideoURLChunk` structures for multimodal data.
*   **StoreFile**: Represents a file record in the storage layer, linking an `external_id` (usually the file path) to its `FileMetadata`.
*   **SearchResponse / AskResponse**: Wrapper structures for search results, where `AskResponse` includes a generated natural language answer alongside the source chunks.

## Input Sources

Data enters the system through multiple channels:

*   **Local File System**: The primary source. Files are read from the project root and its subdirectories.
*   **CLI Arguments & Environment Variables**: Configuration overrides (e.g., `MGREP_STORE`) and search queries are provided via the command line or `process.env`.
*   **Configuration Files**: Persistent settings are loaded from `.mgreprc.yaml`, `.mgreprc.yml`, or global config directories.
*   **Web API (Tavily)**: External web search results are ingested and converted into the internal `TextChunk` format for unified processing.
*   **MCP (Model Context Protocol)**: In `watch-mcp` mode, inputs arrive as JSON-RPC tool calls from external LLM clients.

## Data Transformations

The system performs several stages of data transformation to enable semantic search:

1.  **File to Buffer**: Files are read into memory buffers for hashing and processing.
2.  **Hashing**: Buffers are transformed into SHA256 hex strings to detect changes and avoid redundant indexing.
3.  **Text Splitting (Chunking)**: Large text files are divided into overlapping segments (default 50 lines with 10-line overlap) to maintain context while staying within embedding token limits.
4.  **Vectorization (Embedding)**: Text chunks are sent to an Embedding Provider (OpenAI, Google, or Ollama) which transforms text into high-dimensional numerical vectors (embeddings).
5.  **Query Vectorization**: Natural language queries are transformed using the same embedding model to allow for cosine similarity matching in the vector space.
6.  **Context Augmentation (RAG)**: Search results and the original query are bundled into a prompt for an LLM to transform raw chunks into a coherent answer.

## Storage Mechanisms

*   **Qdrant**: A persistent vector database used to store embeddings and their associated payloads (text content and metadata). It uses payload indexing on `external_id`, `path`, and `path_scopes` for efficient filtering.
*   **Memory Cache**: 
    *   Configuration settings are cached in-memory after the first load.
    *   `NodeFileSystem` maintains an `ignoreCache` to store compiled `.gitignore` and `.mgrepignore` rules.
*   **Local File System**: Used for storing `.mgreprc.yaml` and `.mgrepignore` files.

## Data Validation

Validation occurs at critical junctions to ensure system stability:

*   **Schema Validation**: The `zod` library validates the entire configuration object against `ConfigSchema` upon loading.
*   **File Filtering**: 
    *   **Ignore Patterns**: The `ignore` library filters files based on `.gitignore`, `.mgrepignore`, and hardcoded `DEFAULT_IGNORE_PATTERNS`.
    *   **Size Limits**: Files exceeding `maxFileSize` (default 10MB) are rejected before reading.
*   **Type Safety**: TypeScript interfaces and type guards (e.g., `isWebResult`) ensure data integrity across the pipeline.
*   **CLI Inputs**: `commander` validates that required options are present and that numeric inputs (like `--max-results`) are valid.

## Output Formats

*   **Standard Console Output**: Formatted text including file paths with line ranges, relevance percentages, and optionally the chunk content.
*   **LLM Answers**: Natural language responses with embedded citations (e.g., `<cite i="0"/>`) linking to sources.
*   **MCP Tool Responses**: Structured JSON objects containing tool execution results, formatted for consumption by LLM clients.
*   **Progress Indicators**: Real-time terminal updates (via `ora` spinners) showing sync progress, upload counts, and error summaries.