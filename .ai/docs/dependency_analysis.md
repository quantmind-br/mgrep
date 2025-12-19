# Dependency Analysis

## Internal Dependencies Map

The `mgrep` project is structured with a clear separation between the CLI entry point, command implementations, and core library logic.

- **Entry Point (`src/index.ts`)**: Orchestrates the CLI using `commander` and registers all available commands.
- **Commands (`src/commands/`)**:
    - `search.ts`: Implements the semantic search logic, coordinating between the file system and the vector store.
    - `watch.ts`: Implements a file watcher that synchronizes local changes to the vector store in real-time.
    - `watch_mcp.ts`: Implements a Model Context Protocol (MCP) server for integration with AI agents.
- **Core Library (`src/lib/`)**:
    - `context.ts`: Acts as a central factory/dependency injection container, providing instances of `Store`, `Git`, and `FileSystem`.
    - `config.ts`: Handles configuration loading from YAML files and environment variables, using `zod` for validation.
    - `store.ts`: Defines the `Store` interface and provides a `TestStore` implementation.
    - `qdrant-store.ts`: Implements the `Store` interface using Qdrant as the vector database backend.
    - `file.ts`: Manages file system operations, including recursive file listing and `.gitignore` / `.mgrepignore` filtering.
    - `git.ts`: Provides Git-specific file listing capabilities.
    - `providers/`: Contains AI provider implementations for Embeddings and LLMs (OpenAI, Google, Anthropic).
    - `sync-helpers.ts` & `utils.ts`: Provide shared utility functions for indexing, hashing, and progress tracking.
    - `logger.ts`: Configures the global logging system using `winston`.

## External Libraries Analysis

The project leverages several key external libraries to handle specialized tasks:

- **CLI & UI**:
    - `commander` (^14.0.2): Framework for building the CLI interface.
    - `@clack/prompts` (^0.11.0): Used for interactive CLI prompts.
    - `chalk` (^5.6.2) & `ora` (^5.4.1): Terminal styling and progress spinners.
- **Data & Validation**:
    - `zod` (^3.23.8): Schema validation for configuration and API responses.
    - `yaml` (^2.8.2): Parsing of `.mgreprc.yaml` configuration files.
- **Vector Database**:
    - `@qdrant/js-client-rest` (^1.9.0): Official client for interacting with the Qdrant vector database.
- **AI Providers**:
    - `openai` (^4.52.0): Used for OpenAI and Ollama (OpenAI-compatible) embeddings and LLM completions.
    - *Note: Anthropic and Google providers are implemented using native `fetch` calls to minimize external SDK dependencies.*
- **File System & Utilities**:
    - `ignore` (^7.0.5): Parsing and matching of `.gitignore` and `.mgrepignore` patterns.
    - `istextorbinary` (^9.5.0): Detection of binary files to avoid indexing them.
    - `p-limit` (^3.1.0): Concurrency control for parallel file uploads and processing.
- **Integration**:
    - `@modelcontextprotocol/sdk` (^1.22.0): Implementation of the Model Context Protocol for AI agent integration.
- **Logging**:
    - `winston` (^3.18.3) & `winston-daily-rotate-file` (^5.0.0): Robust logging with file rotation.

## Service Integrations

`mgrep` integrates with several external services and protocols:

- **Qdrant**: The primary storage backend for vector embeddings and file metadata. It is accessed via its REST API.
- **AI Providers**:
    - **OpenAI**: Used for high-quality embeddings and LLM-based answering.
    - **Google (Gemini)**: Supported for both embeddings and LLM tasks.
    - **Anthropic (Claude)**: Supported for LLM tasks (answering queries based on retrieved context).
    - **Ollama**: Supported via its OpenAI-compatible API for local execution.
- **Model Context Protocol (MCP)**: Allows `mgrep` to act as a tool provider for AI agents (like Claude Desktop or IDE plugins), enabling them to perform semantic searches over the local codebase.

## Dependency Injection Patterns

The project uses a lightweight Dependency Injection (DI) pattern centered around factory functions:

- **Central Factory (`src/lib/context.ts`)**: Functions like `createStore()`, `createGit()`, and `createFileSystem()` encapsulate the logic for instantiating concrete implementations. This allows the CLI commands to remain agnostic of the specific store or file system implementation being used.
- **Provider Factories (`src/lib/providers/index.ts`)**: `createEmbeddingsClient()` and `createLLMClient()` instantiate the appropriate provider class based on the user's configuration.
- **Interface-based Design**: Core components are defined as TypeScript interfaces (e.g., `Store`, `FileSystem`, `EmbeddingsClient`). This facilitates testing (via `TestStore`) and makes it easier to add new implementations (e.g., a different vector database) without changing the consuming code.

## Module Coupling Assessment

- **Low Coupling**: The use of interfaces and factory functions effectively decouples the high-level command logic from the low-level implementation details of AI providers and storage backends.
- **High Cohesion**: Each module has a well-defined responsibility. For example, `file.ts` handles all logic related to file discovery and filtering, while `qdrant-store.ts` focuses solely on vector database operations.
- **Configuration-Driven**: The system is highly decoupled through its configuration layer; switching from OpenAI to Google Gemini only requires a change in the `.mgreprc.yaml` file, with no code changes needed in the search or watch logic.

## Dependency Graph

```mermaid
graph TD
    Index[src/index.ts] --> SearchCmd[src/commands/search.ts]
    Index --> WatchCmd[src/commands/watch.ts]
    Index --> WatchMcpCmd[src/commands/watch_mcp.ts]
    
    SearchCmd --> Context[src/lib/context.ts]
    WatchCmd --> Context
    WatchMcpCmd --> Context
    WatchMcpCmd --> MCPSDK[@modelcontextprotocol/sdk]
    
    Context --> Config[src/lib/config.ts]
    Context --> FileSys[src/lib/file.ts]
    Context --> Git[src/lib/git.ts]
    Context --> StoreInt[src/lib/store.ts]
    Context --> QdrantStore[src/lib/qdrant-store.ts]
    Context --> Providers[src/lib/providers/index.ts]
    
    Config --> Zod[zod]
    Config --> YAML[yaml]
    
    FileSys --> Ignore[ignore]
    
    QdrantStore --> QdrantClient[@qdrant/js-client-rest]
    QdrantStore --> StoreInt
    
    Providers --> Embeddings[src/lib/providers/embeddings/index.ts]
    Providers --> LLM[src/lib/providers/llm/index.ts]
    
    Embeddings --> OpenAIEmbed[src/lib/providers/embeddings/openai.ts]
    Embeddings --> GoogleEmbed[src/lib/providers/embeddings/google.ts]
    
    LLM --> OpenAILLM[src/lib/providers/llm/openai.ts]
    LLM --> GoogleLLM[src/lib/providers/llm/google.ts]
    LLM --> AnthropicLLM[src/lib/providers/llm/anthropic.ts]
    
    OpenAIEmbed --> OpenAISDK[openai]
    OpenAILLM --> OpenAISDK
```

## Potential Dependency Issues

- **OpenAI SDK for Ollama**: The project uses the `openai` SDK to interact with Ollama. While Ollama is OpenAI-compatible, this creates a dependency on the OpenAI library even for users who only want to use local models.
- **Synchronous I/O**: Some parts of the file system logic (`NodeFileSystem`) use synchronous Node.js API calls (`fs.readdirSync`, `fs.statSync`). While acceptable for many CLI use cases, this could become a bottleneck for extremely large repositories during the initial scan.
- **Qdrant Hard-coding**: While the `Store` interface allows for other backends, the `createStore` factory is currently hard-coded to return either `TestStore` or `QdrantStore`. Adding a new production store would require modifying the factory logic.
- **Global Logger**: The use of a global logger setup in `src/index.ts` and `src/lib/logger.ts` makes it slightly harder to isolate logging in unit tests, though it is standard for CLI applications.