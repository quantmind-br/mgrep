# Request Flow Analysis

The `mgrep` project is a command-line utility and Model Context Protocol (MCP) server for semantic search and Retrieval-Augmented Generation (RAG) over local codebases. It processes requests either via CLI commands or JSON-RPC over Standard Input/Output (MCP).

## API Endpoints

The application exposes tools through the Model Context Protocol (MCP), which acts as a set of functional endpoints for LLMs. These are defined in `src/commands/watch_mcp.ts`.

### MCP Tools (JSON-RPC Endpoints)
- **`mgrep-search`**: Semantic search over indexed files using natural language.
- **`mgrep-ask`**: RAG-based question answering about the codebase.
- **`mgrep-web-search`**: Web search integration via Tavily.
- **`mgrep-sync`**: Synchronizes local file system state with the vector store.
- **`mgrep-get-file`**: Retrieves specific file content with optional line ranges and security checks.
- **`mgrep-list-files`**: Lists indexed files with pagination and prefix filtering.
- **`mgrep-get-context`**: Retrieves surrounding lines of code for a specific file/line.
- **`mgrep-stats`**: Returns metadata and file counts from the indexed store.

### CLI Commands
- **`mgrep [query]`**: Default command for semantic search or RAG (if `--ask` is provided).
- **`mgrep watch`**: Starts a background process to monitor file changes.
- **`mgrep mcp`**: Starts the MCP server (Stdio transport).
- **`mgrep install-*`**: Commands to register `mgrep` with various AI clients (Claude, Cursor, etc.).

## Request Processing Pipeline

1.  **Entry Point**: `src/index.ts` uses `commander` to parse CLI arguments.
2.  **Initialization**: 
    - Logger setup (`setupLogger`).
    - Configuration loading (`loadConfig` from `~/.mgreprc.yaml` or project root).
    - Provider initialization (LLM, Embeddings, and Store clients).
3.  **Transport (MCP)**: For `watchMcp`, a `StdioServerTransport` is established. Standard output is redirected to stderr to prevent corruption of the JSON-RPC stream.
4.  **Security Middleware (Implicit)**: In `mgrep-get-file`, requests pass through a validation layer that ensures paths are within the project root and resolves symlinks to prevent directory traversal.
5.  **Execution**: The request is dispatched to the corresponding handler in `src/commands/watch_mcp.ts` or `src/commands/search.ts`.

## Routing Logic

### CLI Routing
`commander` routes input to the appropriate command handler based on the subcommand (e.g., `search`, `mcp`, `watch`).

### MCP Routing
The `Server.setRequestHandler` from the `@modelcontextprotocol/sdk` is used:
- **`ListToolsRequestSchema`**: Returns the list of available tools.
- **`CallToolRequestSchema`**: Uses a `switch(name)` statement to route tool calls to their respective logic blocks based on the `name` parameter in the JSON-RPC request.

## Response Generation

### MCP Responses
- Handlers return objects matching the MCP `CallToolResult` schema.
- Content is typically wrapped in a `text` type.
- **Formatting**: Internal helpers like `formatSearchResultsForMcp` and `formatAskResultsForMcp` convert raw store data or LLM responses into human-readable (or LLM-readable) strings, including relevance scores and citations.
- **JSON Serialization**: Complex data (like file content metadata) is returned as stringified JSON within the MCP text block.

### CLI Responses
- Search results and RAG answers are printed to `stdout`.
- Progress indicators (spinners) and logs are sent to `stderr`.

## Error Handling

1.  **Protocol Errors**: `McpError` class is used to return standard JSON-RPC errors (e.g., `InvalidParams`, `InternalError`).
2.  **Graceful Shutdown**: SIGINT and SIGTERM handlers ensure the MCP server or watch process exits cleanly.
3.  **Global Catch-all**: `unhandledRejection` and `uncaughtException` listeners log fatal errors to `stderr`.
4.  **Local Try-Catch**: Each tool handler contains try-catch blocks to catch provider errors (e.g., API failures from Anthropic or Qdrant) and translate them into meaningful MCP error messages.
5.  **Validation**: Input parameters (like `query` or `path`) are checked at the start of handlers, throwing `ErrorCode.InvalidParams` if requirements aren't met.