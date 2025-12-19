# Data Flow Analysis

## Data Models Overview

The `mgrep` application uses several key data models to manage configuration, file metadata, and vector search data:

- **MgrepConfig**: Defined using Zod schemas in `src/lib/config.ts`. It encompasses settings for `qdrant`, `embeddings` (provider, model, batch size), `llm` (provider, model, temperature), and `sync` (concurrency).
- **FileMetadata**: A simple structure containing `path` and `hash` (SHA256), used to track file changes and determine if a file needs re-indexing.
- **Chunk Models**:
    - `BaseChunk`: Contains `score`, `metadata`, `chunk_index`, and `generated_metadata` (start line, number of lines).
    - `TextChunk`: Extends `BaseChunk` with the actual `text` content.
    - `ImageURLChunk`, `AudioURLChunk`, `VideoURLChunk`: Variants for multi-modal data.
- **StoreFile**: Represents a file in the store with an `external_id` and its `metadata`.
- **QdrantPayload**: The schema for data stored in Qdrant points, including `external_id`, `path`, `path_scopes` (for prefix filtering), `hash`, `content`, `chunk_index`, and line information.
- **Provider Models**:
    - `EmbeddingResult`: Contains the numerical `embedding` vector and `tokenCount`.
    - `ChatMessage` & `CompletionResult`: Models for LLM interactions (role, content, token usage).

## Data Transformation Map

Data undergoes several transformations as it moves from the local filesystem to the vector database and finally to the user:

1.  **File Content to Chunks**: In `QdrantStore.chunkText`, raw file content is split into overlapping text chunks (default 50 lines with 10 lines overlap).
2.  **Text to Vectors**: Text chunks are passed to `EmbeddingsClient.embedBatch`, which transforms strings into high-dimensional numerical vectors using providers like OpenAI or Google.
3.  **Metadata Enrichment**: Filesystem paths are transformed into `path_scopes` (e.g., `/a/b/c` -> `["/", "/a", "/a/b", "/a/b/c"]`) to support efficient prefix-based filtering in Qdrant.
4.  **Deterministic ID Generation**: `generatePointId` transforms a combination of `externalId` and `chunkIndex` into a UUID-compatible string using SHA256, ensuring that the same chunk always maps to the same point in Qdrant.
5.  **Query to Context**: During a search or "ask" operation:
    - The user's natural language query is transformed into a vector.
    - Qdrant returns matching `QdrantPayload` objects.
    - These payloads are transformed back into `TextChunk` objects.
    - For "ask" commands, these chunks are serialized into a text block used as context for the LLM prompt.

## Storage Interactions

- **Qdrant (Vector Database)**: The primary persistence layer. It stores embeddings and their associated payloads. Interactions include `upsert` (for indexing), `search` (for similarity retrieval), and `delete` (for removing files).
- **Local Filesystem**:
    - **Source Data**: Reads project files for indexing.
    - **Configuration**: Reads `.mgreprc.yaml` (local) and `~/.config/mgrep/config.yaml` (global).
    - **Ignore Rules**: Reads `.gitignore` and `.mgrepignore` to filter files.
- **Git**: The application interacts with Git (via `NodeGit`) to identify tracked files and respect repository boundaries.

## Validation Mechanisms

- **Configuration Validation**: `zod` is used in `src/lib/config.ts` to strictly validate the structure and types of configuration files and environment variables.
- **File Integrity**: SHA256 hashes are calculated for every file. During sync, the application compares the local hash with the hash stored in Qdrant to skip unchanged files.
- **File Size Constraints**: The `maxFileSize` setting (default 10MB) is checked before reading or processing any file to prevent memory issues or API limits.
- **Provider Validation**: The system validates provider types (e.g., ensuring Anthropic isn't used for embeddings) and ensures required API keys are present.

## State Management Analysis

- **Stateless CLI Design**: The `mgrep` CLI is designed to be mostly stateless. It does not maintain a local database of indexed files; instead, it queries Qdrant to determine the current state of the remote index.
- **Configuration Caching**: `src/lib/config.ts` implements a simple `configCache` (a `Map`) to avoid re-parsing configuration files multiple times during a single execution.
- **Deterministic State Mapping**: By using deterministic point IDs based on file paths and chunk indices, the application maintains a consistent mapping between the local filesystem state and the remote vector store without needing a separate state synchronization table.

## Serialization Processes

- **YAML Serialization**: Configuration is stored and read in YAML format using the `yaml` package.
- **JSON Serialization**:
    - Communication with the Qdrant REST API.
    - Communication with LLM and Embedding provider APIs (OpenAI, Google, Anthropic).
- **Text Encoding**: File contents are read as UTF-8 strings. The `QdrantStore` handles both Node.js `ReadableStream` and Web `ReadableStream` for file uploads, ensuring cross-environment compatibility.
- **Vector Serialization**: Embeddings are handled as arrays of numbers (`number[]`) before being sent to or received from Qdrant.

## Data Lifecycle Diagrams

### Indexing Lifecycle
```
[File System] -> (Read) -> [Raw Content] -> (Hash) -> [Metadata]
                                |
                        (Chunking Logic)
                                |
                        [Text Chunks] -> (Embedding Provider) -> [Vectors]
                                |                                   |
                        (Combine with Metadata & Deterministic ID)
                                |
                        [Qdrant Point (Payload + Vector)] -> (Upsert) -> [Qdrant DB]
```

### Search & Ask Lifecycle
```
[User Query] -> (Embedding Provider) -> [Query Vector]
                                            |
                                    (Vector Similarity Search)
                                            |
[Qdrant DB] ------------------------> [Matched Payloads]
                                            |
                                    (Transform to Chunks)
                                            |
[LLM Answer] <--- (LLM Provider) <--- [Contextual Prompt]
```