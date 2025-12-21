# Request Flow Analysis

## Entry Points Overview

The `mgrep` system features two primary entry points that cater to different usage modes:

1.  **CLI Entry Point (`src/index.ts`)**: The main command-line interface built with `commander`. It parses terminal arguments and routes them to specific command handlers.
2.  **MCP Entry Point (`src/commands/watch_mcp.ts`)**: A Model Context Protocol (MCP) server that exposes `mgrep` capabilities as tools for AI models. It communicates via JSON-RPC over standard input/output (`StdioServerTransport`).

## Request Routing Map

Routing is handled differently based on the entry point:

### CLI Routing
The `commander` library manages the routing of CLI commands:
*   `mgrep search [pattern] [path]`: Routes to the `search` handler in `src/commands/search.ts`.
*   `mgrep watch`: Routes to the `watch` handler in `src/commands/watch.ts`.
*   `mgrep mcp`: Routes to the `watchMcp` handler in `src/commands/watch_mcp.ts`.
*   `mgrep install-*` / `mgrep uninstall-*`: Routes to integration scripts in `src/install/`.

### MCP Routing
The MCP server uses the `@modelcontextprotocol/sdk` to route tool calls:
*   `ListToolsRequest`: Returns a list of available tools (`mgrep-search`, `mgrep-ask`, `mgrep-web-search`, `mgrep-sync`).
*   `CallToolRequest`: Routes the request to the appropriate logic based on the `name` parameter:
    *   `mgrep-search`: Performs semantic search over indexed files.
    *   `mgrep-ask`: Performs RAG-based question answering.
    *   `mgrep-web-search`: Triggers an external web search via Tavily.
    *   `mgrep-sync`: Force-synchronizes local files with the vector store.

## Middleware Pipeline

While not using traditional HTTP middleware, the system follows a consistent preprocessing pipeline for every request:

1.  **Logger Initialization**: `setupLogger()` is invoked at the start of `src/index.ts`.
2.  **Configuration Loading**: `loadConfig()` reads settings from `.mgreprc.yaml`, environment variables, and CLI overrides.
3.  **Context Creation**: `createStore()` initializes the `QdrantStore` along with the necessary embedding and LLM providers based on the loaded configuration.
4.  **Sync Check (Conditional)**: If synchronization is requested (or automatic in watch mode), `initialSync` is executed to ensure the vector store is up-to-date with local files before the search/ask request is processed.

## Controller/Handler Analysis

The core logic resides in the command handlers:

*   **Search Handler (`src/commands/search.ts`)**: Processes semantic search queries. It uses `store.search` for retrieval and can optionally incorporate web results from `performWebSearch`. It also supports RAG via `store.ask`.
*   **Watch Handler (`src/commands/watch.ts`)**: Implements a persistent file watcher using `fs.watch`. It listens for file system events (change, rename, delete) and updates the vector store in real-time.
*   **MCP Handler (`src/commands/watch_mcp.ts`)**: Acts as a bridge between MCP tool calls and the underlying `Store` methods. It manages its own request-response formatting optimized for LLM consumption.

## Authentication & Authorization Flow

`mgrep` does not implement user-level authentication but manages service-level authentication through API keys:

1.  **Key Retrieval**: API keys for Qdrant, OpenAI/Anthropic/Google, and Tavily are retrieved during the configuration loading phase.
2.  **Provider Injection**: These keys are passed into the provider clients (Embeddings, LLM, Store) within `src/lib/context.ts`.
3.  **Request Authorization**: Every request to external services (like Qdrant or an LLM provider) includes these keys in the authorization headers.

## Error Handling Pathways

Error handling is structured to provide clear feedback and maintain stability:

*   **CLI Errors**: Wrapped in `try...catch` blocks. Errors are logged to `console.error`, and `process.exitCode` is set to 1 to signal failure to the terminal.
*   **MCP Errors**: Uses the `McpError` class and standard `ErrorCode` constants. Errors are returned as formal JSON-RPC error responses. Logs are redirected to `stderr` to avoid corrupting the `stdout` communication channel.
*   **Validation Errors**: The system uses `zod` schemas in `src/lib/config.ts` to validate configuration files and `commander`/`MCP` schemas to validate input parameters.

## Request Lifecycle Diagram

```mermaid
graph TD
    A[User/LLM Request] --> B{Entry Point}
    B -->|CLI| C[Commander Router]
    B -->|MCP| D[MCP Server Router]
    
    C --> E[loadConfig]
    D --> E
    
    E --> F[createStore]
    F --> G[Sync Logic (initialSync)]
    
    G --> H{Handler Logic}
    H -->|Search| I[store.search]
    H -->|Ask| J[store.ask / LLM RAG]
    H -->|Web| K[Tavily Search]
    
    I --> L[Format Response]
    J --> L
    K --> L
    
    L --> M[Output to Terminal / MCP Client]
```