# Code Structure Analysis

## Architectural Overview
`mgrep` is a semantic search and file indexing CLI tool designed to bridge local codebases with vector-based retrieval and LLM-powered question answering. The architecture is built around a **Sync-on-Demand** pattern, where local file systems are synchronized with a vector database (primarily Qdrant) before search or query operations.

The system is organized into several distinct layers:
- **CLI Layer**: Handles command parsing and user interaction.
- **Command Layer**: Orchestrates high-level workflows like searching, watching, and installing integrations.
- **Service/Library Layer**: Contains the core logic for file system traversal, git integration, text chunking, and synchronization.
- **Provider Layer**: Abstracted interfaces for external AI services (Embeddings and LLMs).
- **Storage Layer**: Abstracted interface for vector database operations.

## Core Components
- **CLI Entry Point (`src/index.ts`)**: The main executable that configures the `commander` CLI and registers all commands.
- **Search Command (`src/commands/search.ts`)**: The primary interface for semantic search and RAG (Retrieval-Augmented Generation). It triggers synchronization before executing queries.
- **Watch Command (`src/commands/watch.ts`)**: Monitors the file system for changes and incrementally updates the vector store.
- **MCP Server (`src/commands/watch_mcp.ts`)**: Implements the Model Context Protocol to allow AI agents to interact with the `mgrep` indexing service.
- **Qdrant Store (`src/lib/qdrant-store.ts`)**: The concrete implementation of the `Store` interface, managing collections, point IDs, and vector searches in Qdrant.
- **File System Manager (`src/lib/file.ts`)**: Handles recursive file discovery, respecting `.gitignore` and `.mgrepignore` patterns.
- **Git Integration (`src/lib/git.ts`)**: Provides utilities to detect git repositories and list tracked/untracked files using the `git` CLI.

## Service Definitions
- **Store Service (`Store` interface)**: Responsible for the lifecycle of documents in the vector database, including uploading, deleting, searching, and retrieving store metadata.
- **Embeddings Service (`EmbeddingsClient` interface)**: Generates high-dimensional vector representations of text chunks.
- **LLM Service (`LLMClient` interface)**: Provides chat completion capabilities, used primarily for the `ask` functionality to generate answers from retrieved context.
- **Sync Service (`initialSync` in `src/lib/utils.ts`)**: A critical utility that reconciles the state of the local file system with the vector store by comparing file hashes.

## Interface Contracts
- **`Store`**: Defines methods for `listFiles`, `uploadFile`, `deleteFile`, `search`, `ask`, and `getInfo`.
- **`EmbeddingsClient`**: Defines `embed`, `embedBatch`, and `getDimensions`.
- **`LLMClient`**: Defines `chat` and `chatStream`.
- **`FileSystem`**: Defines `getFiles` and `isIgnored`.
- **`Git`**: Defines `isGitRepository`, `getGitFiles`, and `getGitIgnoreFilter`.

## Design Patterns Identified
- **Strategy Pattern**: Used extensively for `Store`, `EmbeddingsClient`, and `LLMClient` to support multiple providers (OpenAI, Google, Anthropic, Ollama) and storage backends.
- **Factory Pattern**: Centralized in `src/lib/context.ts`, which provides `createStore`, `createGit`, and `createFileSystem` functions that instantiate the correct classes based on the loaded configuration.
- **Dependency Injection**: The `QdrantStore` is injected with `EmbeddingsClient` and `LLMClient` instances, promoting testability and decoupling.
- **Adapter Pattern**: The `NodeFileSystem` and `NodeGit` classes adapt standard Node.js APIs and CLI tools to the project's internal interfaces.
- **Singleton/Cached Configuration**: `src/lib/config.ts` uses a caching mechanism for the loaded configuration to avoid redundant disk I/O.

## Component Relationships
- **Commands** depend on **Context Factories** to obtain instances of **Store**, **FileSystem**, and **Git**.
- **Store** implementations (like `QdrantStore`) depend on **Provider Clients** (Embeddings/LLM) to process data.
- **Sync Logic** acts as a bridge between the **FileSystem** and the **Store**, using **Git** to refine the scope of files to be processed.
- **Configuration** is the foundation used by all components to determine behavior, provider types, and API credentials.

## Key Methods & Functions
- **`initialSync(...)` (`src/lib/utils.ts`)**: Orchestrates the full synchronization process, including hash comparison and parallelized uploads.
- **`QdrantStore.ask(...)`**: Implements the RAG pipeline: search for context -> augment prompt -> call LLM -> return answer with citations.
- **`chunkText(...)` (`src/lib/qdrant-store.ts`)**: Implements the logic for splitting source code into overlapping windows to maintain context during embedding.
- **`loadConfig(...)` (`src/lib/config.ts`)**: Merges configuration from global YAML, local YAML, and environment variables with strict Zod validation.

## Available Documentation
- **`/.ai/docs/`**: Contains detailed AI-generated analyses:
    - `api_analysis.md`: Deep dive into API structures.
    - `data_flow_analysis.md`: Traces how data moves through the system.
    - `dependency_analysis.md`: Maps internal and external dependencies.
    - `request_flow_analysis.md`: Details the lifecycle of a search/ask request.
    - `structure_analysis.md`: Earlier structural overview.
- **`AGENTS.md`**: Guidelines for AI agents interacting with the codebase.
- **`CLAUDE.md`**: Development notes and commands for Claude Code.
- **`README.md`**: High-level user documentation and installation instructions.
- **`/guides/README.md`**: Additional usage guides.

**Documentation Quality**: High. The presence of specialized AI documentation in `.ai/docs/` and clear rule definitions in `.cursor/rules/` suggests a codebase optimized for both human developers and AI assistants.