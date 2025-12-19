# Code Structure Analysis

## Architectural Overview

`mgrep` is a modular TypeScript-based CLI tool designed for semantic search and file synchronization within code repositories. The architecture is built around a provider-based model that abstracts vector storage and AI capabilities (embeddings and LLMs), allowing for flexible integration with different backends.

The system follows a layered approach:
- **CLI Layer**: Handles command-line parsing and user interaction.
- **Service Layer**: Orchestrates core logic such as file system traversal, git integration, and synchronization.
- **Abstraction Layer**: Defines vendor-neutral interfaces for storage and AI providers.
- **Provider Layer**: Implements specific integrations (e.g., Qdrant for storage, OpenAI/Anthropic for AI).

## Core Components

### CLI Entry Point (`src/index.ts`)
- Bootstraps the application using `commander`.
- Registers commands for searching, watching, and installing integrations.
- Initializes global logging and configuration.

### Command Modules (`src/commands/`)
- **search.ts**: Implements semantic search and question-answering logic.
- **watch.ts**: Provides a file-watching service that synchronizes local changes to a remote store.
- **watch_mcp.ts**: Integration with the Model Context Protocol (MCP).

### Core Library (`src/lib/`)
- **store.ts**: Defines the `Store` interface and common data types for semantic storage.
- **qdrant-store.ts**: The primary implementation of the `Store` interface using the Qdrant vector database.
- **file.ts**: Handles file system operations, including filtering based on ignore patterns.
- **git.ts**: Provides git-specific functionality like identifying tracked files.
- **config.ts**: Manages hierarchical configuration (defaults, global, local, environment variables) using Zod for validation.
- **context.ts**: A factory module that wires together services and providers based on configuration.

### Provider System (`src/lib/providers/`)
- **Embeddings**: Implementations for generating vector embeddings (Google, OpenAI).
- **LLM**: Implementations for large language model interactions (Anthropic, Google, OpenAI).

## Service Definitions

### Store Service (`Store` interface)
- **Responsibility**: Manages the persistence and retrieval of document embeddings and metadata.
- **Key Operations**: `uploadFile`, `deleteFile`, `search`, `ask`, `listFiles`.
- **Implementation**: `QdrantStore` handles text chunking, embedding generation via providers, and vector indexing in Qdrant.

### File System Service (`FileSystem` interface)
- **Responsibility**: Provides a filtered view of the local file system.
- **Key Operations**: `getFiles`, `isIgnored`.
- **Implementation**: `NodeFileSystem` integrates with `NodeGit` to respect `.gitignore` and `.mgrepignore` files.

### Configuration Service
- **Responsibility**: Aggregates configuration from multiple sources.
- **Hierarchy**: CLI Flags > Environment Variables > Local `.mgreprc.yaml` > Global `~/.config/mgrep/config.yaml` > Defaults.

## Interface Contracts

### Store Interface (`src/lib/store.ts`)
```typescript
export interface Store {
  listFiles(storeId: string, options?: ListFilesOptions): AsyncGenerator<StoreFile>;
  uploadFile(storeId: string, file: File | ReadableStream, options: UploadFileOptions): Promise<void>;
  deleteFile(storeId: string, externalId: string): Promise<void>;
  search(storeIds: string[], query: string, top_k?: number, search_options?: { rerank?: boolean }, filters?: SearchFilter): Promise<SearchResponse>;
  ask(storeIds: string[], question: string, top_k?: number, search_options?: { rerank?: boolean }, filters?: SearchFilter): Promise<AskResponse>;
}
```

### AI Provider Interfaces (`src/lib/providers/types.ts`)
- **EmbeddingsClient**: `embed(text: string)`, `embedBatch(texts: string[])`, `getDimensions()`.
- **LLMClient**: `chat(messages: ChatMessage[])`, `chatStream?(messages: ChatMessage[])`.

## Design Patterns Identified

- **Factory Pattern**: Used in `src/lib/context.ts` (`createStore`, `createFileSystem`) to instantiate complex objects with their dependencies.
- **Strategy Pattern**: The provider system for Embeddings and LLMs allows switching between different AI vendors at runtime via configuration.
- **Repository Pattern**: The `Store` interface abstracts the underlying vector database (Qdrant), treating it as a collection of documents.
- **Command Pattern**: Each CLI command is encapsulated in its own module, following the `commander` pattern.
- **Dependency Injection**: Services like `NodeFileSystem` receive their dependencies (like `Git`) through the constructor.

## Component Relationships

1.  **CLI Commands** use the **Context Factory** to obtain instances of **Store** and **FileSystem**.
2.  **QdrantStore** (the Store implementation) depends on **EmbeddingsClient** and **LLMClient** to process data.
3.  **NodeFileSystem** depends on **NodeGit** to determine which files should be ignored.
4.  **Config** is used globally to drive the instantiation logic in the **Context Factory**.

## Key Methods & Functions

- `createStore()` (`src/lib/context.ts`): The central wiring function that initializes the vector store and AI providers.
- `search()` / `ask()` (`src/lib/qdrant-store.ts`): Core semantic operations that combine vector search with LLM synthesis.
- `chunkText()` (`src/lib/qdrant-store.ts`): Internal logic for splitting files into overlapping segments for better embedding granularity.
- `loadConfig()` (`src/lib/config.ts`): Hierarchical configuration loader with Zod validation.
- `initialSync()` (`src/lib/sync-helpers.ts`): Logic for bulk uploading repository files to the store.

## Available Documentation

- **README.md**: High-level overview and usage instructions.
- **PLAN.md**: Development roadmap and task tracking.
- **AGENTS.md**: Documentation regarding AI agent integrations.
- **.ai/docs/**:
    - `structure_analysis.md`: **Note: This document appears outdated** as it references "Mixedbread" instead of the current "Qdrant" implementation.
    - `api_analysis.md`, `data_flow_analysis.md`, `dependency_analysis.md`, `request_flow_analysis.md`.
- **guides/README.md**: Additional user guides.

**Documentation Quality**: The codebase is well-structured, but the internal architectural documentation in `.ai/docs/` needs updating to reflect the shift from Mixedbread to the generic provider/Qdrant architecture. The code itself is highly readable with clear interface definitions.