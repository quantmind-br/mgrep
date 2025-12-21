# Code Structure Analysis

## Architectural Overview
`mgrep` is a CLI-based semantic search and file indexing tool that synchronizes local codebases with vector-based storage for retrieval and LLM-powered question answering. The architecture follows a **Provider-based Strategy** pattern, allowing for interchangeable AI backends (OpenAI, Google, Anthropic, Ollama) and storage solutions.

The system is organized into three primary layers:
1.  **Command Layer (`src/commands`)**: Orchestrates high-level workflows such as semantic search, file watching, and installation of integrations.
2.  **Service/Library Layer (`src/lib`)**: Contains the core logic for file system traversal, Git integration, text chunking, and synchronization.
3.  **Provider Layer (`src/lib/providers`)**: Defines abstract interfaces for external AI services (Embeddings, LLMs, Web Search) to decouple the application from specific vendor SDKs.

## Core Components
*   **CLI Entry Point (`src/index.ts`)**: Initializes the `commander` CLI, sets up the logger, and registers all commands.
*   **Search Command (`src/commands/search.ts`)**: Implements the RAG (Retrieval-Augmented Generation) pipeline. It ensures the local file system is synchronized with the store before performing searches or "ask" queries.
*   **Watch Command (`src/commands/watch.ts`)**: Implements a long-running service that monitors the file system for changes and incrementally updates the vector store in real-time.
*   **MCP Server (`src/commands/watch_mcp.ts`)**: Provides a Model Context Protocol interface, allowing AI agents (like Claude Desktop) to interact with `mgrep` as a tool.
*   **Qdrant Store (`src/lib/qdrant-store.ts`)**: The default implementation of the `Store` interface, managing vector collections, deterministic point ID generation, and metadata filtering.
*   **Config Manager (`src/lib/config.ts`)**: Handles configuration loading from `.mgreprc.yaml` and environment variables, using Zod for schema validation.

## Service Definitions
*   **Synchronization Service (`src/lib/utils.ts` -> `initialSync`)**: Reconciles the local file system state with the vector store by comparing file hashes and managing parallelized uploads.
*   **File Discovery Service (`src/lib/file.ts`)**: Provides recursive directory traversal while respecting `.gitignore` and `.mgrepignore` rules.
*   **Context Factory (`src/lib/context.ts`)**: Acts as a lightweight Dependency Injection container, instantiating stores, file systems, and providers based on the current configuration.

## Interface Contracts
*   **`Store` (`src/lib/store.ts`)**: Defines the contract for vector database operations: `search`, `ask`, `uploadFile`, `deleteFile`, `listFiles`, and `getInfo`.
*   **`EmbeddingsClient` (`src/lib/providers/types.ts`)**: Defines the interface for generating vector embeddings: `embed`, `embedBatch`, and `getDimensions`.
*   **`LLMClient` (`src/lib/providers/types.ts`)**: Defines the interface for chat completions: `chat` and `chatStream`.
*   **`WebSearchClient` (`src/lib/providers/web/types.ts`)**: Defines the contract for external web search (currently implemented via Tavily).

## Design Patterns Identified
*   **Strategy Pattern**: Applied to AI providers (LLM/Embeddings) and storage backends, allowing the tool to work across different hardware and API environments.
*   **Command Pattern**: The CLI is built using the `commander` library, where each command is an isolated module responsible for its own flags and logic.
*   **Adapter Pattern**: Used in `NodeFileSystem` and `NodeGit` to wrap native Node.js and CLI tools into project-specific interfaces.
*   **Retrieval-Augmented Generation (RAG)**: The core pattern for the `ask` command, which retrieves relevant code chunks to provide context to an LLM.
*   **Observer Pattern**: Leveraged by the `watch` command to react to file system events and trigger store updates.

## Component Relationships
*   **CLI Commands** utilize the **Context Factory** to resolve their dependencies (Store, Providers, FileSystem).
*   **Store** implementations depend on **EmbeddingsClient** for indexing and **LLMClient** for the RAG-based `ask` functionality.
*   **Sync Logic** coordinates between the **FileSystem** (source of truth) and the **Store** (searchable index).
*   **Providers** are isolated from the rest of the logic, only interacting via the standard interfaces defined in `src/lib/providers/types.ts`.

## Key Methods & Functions
*   **`initialSync(...)`**: The primary synchronization logic that determines which files need to be uploaded, updated, or deleted.
*   **`QdrantStore.ask(...)`**: The implementation of the semantic question-answering workflow, including prompt augmentation and source citation.
*   **`chunkText(...)`**: The text-splitting logic in `QdrantStore` that breaks files into overlapping windows to preserve context for embeddings.
*   **`loadConfig(...)`**: Centralized configuration logic that merges multiple sources (global, local, ENV) into a single typed object.

## Available Documentation
*   **`/.ai/docs/structure_analysis.md`**: Provides an architectural overview and component breakdown.
*   **`/.ai/docs/api_analysis.md`**: Detailed analysis of internal and external APIs.
*   **`/.ai/docs/request_flow_analysis.md`**: Traces the path of search and ask requests through the system.
*   **`/.ai/docs/data_flow_analysis.md`**: Maps how data moves from the file system to the vector store.
*   **`/.cursor/rules/`**: Contains `.mdc` files defining project rules for CLI commands, code patterns, and storage.
*   **`README.md`**: General project information, installation, and usage instructions.

**Documentation Quality**: Excellent. The project maintains high-quality, AI-ready documentation in the `.ai/docs/` directory and clear development guidelines in `CLAUDE.md` and `AGENTS.md`.