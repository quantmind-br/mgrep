# Code Structure Analysis

## Architectural Overview

The codebase is organized as a modular CLI application written in TypeScript, following a service-oriented architecture with clear abstractions for external dependencies. It serves as a semantic search and synchronization tool ("mgrep") that bridges local file systems with vector databases (primarily Qdrant) and AI service providers (OpenAI, Google, Anthropic).

The architecture is layered into three primary tiers:
1.  **Interface Layer**: CLI commands and an MCP (Model Context Protocol) server adapter.
2.  **Logic & Orchestration Layer**: Synchronization engines, file system traversal logic, and RAG (Retrieval-Augmented Generation) flows.
3.  **Infrastructure & Provider Layer**: Abstracted clients for vector storage, embeddings generation, LLM reasoning, and web searching.

## Core Components

-   **CLI Entry Point (`src/index.ts`)**: Uses the `commander` library to define the application's command-line interface, routing user input to specific command handlers.
-   **Synchronization Engine (`src/lib/utils.ts`)**: Implements the logic for comparing local file states with the remote store, handling batch uploads, and optimizing sync using file hashes and metadata (size, mtime).
-   **File System Manager (`src/lib/file.ts`)**: Provides a hierarchical file discovery system that respects `.gitignore` and `.mgrepignore` patterns.
-   **MCP Server (`src/commands/watch_mcp.ts`)**: An adapter that exposes the application's search and Q&A capabilities as tools for AI agents following the Model Context Protocol.
-   **Configuration System (`src/lib/config.ts`)**: A robust system using `zod` for validation and `YAML` for parsing, supporting global, local, and environment-based configuration.

## Service Definitions

-   **Store Service**: Encapsulated by the `Store` interface, it manages the lifecycle of document chunks, embeddings, and metadata in a vector database. The primary implementation is `QdrantStore`.
-   **Embeddings Provider**: Responsibility is to convert text content into high-dimensional vectors. Supported providers include OpenAI, Google, and Ollama.
-   **LLM Provider**: Responsible for generating natural language answers based on retrieved context (RAG). Supported providers include OpenAI, Anthropic, and Google.
-   **Git Service**: Interacts with the local `git` CLI to efficiently identify tracked and untracked files within a repository.
-   **Web Search Service**: Provides supplemental context through external search (e.g., Tavily API) to enhance RAG results.

## Interface Contracts

-   **`Store`**: Defines the contract for storage operations: `listFiles`, `uploadFile`, `deleteFile`, `search`, `ask`, and `getInfo`.
-   **`EmbeddingsClient`**: Defines a standard interface for embedding generation: `embed(text)`, `embedBatch(texts)`, and `getDimensions()`.
-   **`LLMClient`**: Defines the contract for conversational AI interactions: `chat(messages)` and `chatStream(messages)`.
-   **`FileSystem`**: Defines the contract for file discovery and filtering: `getFiles(root)`, `isIgnored(path)`, and `loadMgrepignore(root)`.

## Design Patterns Identified

-   **Strategy Pattern**: Used extensively in the `providers` directory to allow swapping between different AI models and storage backends (OpenAI vs. Google vs. Anthropic) without changing core logic.
-   **Factory Pattern**: Utilized in `src/lib/context.ts` (e.g., `createStore`, `createEmbeddingsClient`) to centralize the instantiation of complex services with their required configurations.
-   **Adapter Pattern**: The MCP server acts as an adapter, translating the internal `Store` and `Search` APIs into the standardized Model Context Protocol format.
-   **Dependency Injection**: Dependencies like `EmbeddingsClient` and `LLMClient` are injected into the `QdrantStore` constructor, facilitating testability and loose coupling.
-   **Observer Pattern**: The `watch` command uses the file system's native event-watching capabilities (`fs.watch`) to trigger incremental synchronization.
-   **Facade Pattern**: The `utils.ts` module provides simplified functions like `initialSync` that orchestrate complex interactions between the `Store`, `FileSystem`, and `EmbeddingsClient`.

## Component Relationships

-   **Commands** (`search`, `watch`) act as the orchestrators, calling `createStore()` to initialize the infrastructure and then invoking `initialSync` or `Store.search`.
-   **Store Implementations** (`QdrantStore`) depend on **EmbeddingsClients** to vectorize text before storage or search and **LLMClients** to process "ask" queries.
-   **FileSystem** depends on the **Git** service to correctly handle repository-aware file discovery.
-   **Sync Helpers** provide progress tracking (via `ora` spinners) and summary formatting for the CLI layer while the core logic resides in the `utils` and `Store` components.

## Key Methods & Functions

-   **`initialSync()`**: The core algorithm for reconciling local file state with the vector store.
-   **`uploadFile()`**: Handles the chunking, embedding, and transmission of file content to the store.
-   **`startWatch()`**: Sets up the persistent background process for real-time synchronization.
-   **`Store.ask()`**: Implements the RAG pipeline, combining semantic search with LLM reasoning to answer questions.
-   **`loadConfig()`**: Resolves and validates the application configuration from multiple sources (YAML, Env, CLI).
-   **`NodeFileSystem.isIgnored()`**: Implements complex hierarchical ignore logic for both standard and custom ignore files.