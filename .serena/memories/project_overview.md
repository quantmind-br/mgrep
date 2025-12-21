# mgrep Project Overview

## Purpose
mgrep is a semantic search CLI tool that serves as a modern, AI-powered replacement for traditional grep. It indexes codebases into a Qdrant vector database and enables:
- **Semantic Search**: Find code by meaning/intent rather than keywords
- **RAG (Retrieval-Augmented Generation)**: Ask natural language questions about codebases
- **Real-time Synchronization**: Background file watching with incremental updates
- **AI Agent Integration**: MCP server and Claude plugin for AI tools integration
- **Web Search**: Tavily-powered web search combined with local results

## Tech Stack
- **Language**: TypeScript (ES2022, NodeNext modules)
- **Runtime**: Node.js
- **CLI Framework**: commander
- **Vector Database**: Qdrant (via REST API)
- **AI Providers**: OpenAI, Anthropic (Claude), Google Gemini, Ollama
- **Web Search**: Tavily
- **Validation**: Zod
- **Logging**: Winston with daily rotation
- **Protocols**: Model Context Protocol (MCP)

## Key Features
- Multi-provider support (embeddings and LLM)
- Respects `.gitignore` and `.mgrepignore` patterns
- Deterministic point IDs using SHA256 hashes
- Path-scope metadata for efficient directory filtering
- Concurrency-controlled indexing (p-limit)
- File size limits and binary detection

## Repository Structure
```
src/
├── index.ts              # CLI entry point
├── commands/             # CLI commands (search, watch, mcp)
├── install/              # System integration scripts
└── lib/
    ├── config.ts         # Configuration with Zod validation
    ├── context.ts        # Dependency injection factory
    ├── store.ts          # Store interface
    ├── qdrant-store.ts   # Qdrant implementation
    ├── file.ts           # File system abstraction
    ├── git.ts            # Git integration
    ├── utils.ts          # Sync utilities
    └── providers/        # AI provider implementations
        ├── embeddings/   # OpenAI, Google embeddings
        ├── llm/          # OpenAI, Anthropic, Google LLM
        └── web/          # Tavily web search

test/                     # Bats integration tests
plugins/                  # Claude plugin
```
