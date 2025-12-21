# Suggested Commands for mgrep Development

## Development Commands

### Building
```bash
npm run build           # Build TypeScript to dist/
npm run dev             # Build and run (via ts-node)
make build              # Same as npm run build
```

### Testing
```bash
npm run test            # Run Bats integration tests (excludes long-running)
npm run test:unit       # Run Vitest unit tests
npm run test:unit:watch # Run Vitest in watch mode
npm run test:coverage   # Run tests with coverage report
npm run test:all        # Run both unit and integration tests
make test               # Same as npm run test
```

### Linting & Formatting
```bash
npm run lint            # Check for lint errors (Biome)
npm run format:check    # Check formatting without writing
npm run format          # Format and fix code (Biome)
npm run typecheck       # TypeScript type checking only
make lint               # Same as npm run lint
make format             # Same as npm run format
make typecheck          # Same as npm run typecheck
```

### Running CLI
```bash
npm run start -- search "query"    # Run search via ts-node
./bin/run search "query"           # Run after build
mgrep search "query"               # After global install
```

## Infrastructure Commands

### Qdrant (Docker)
```bash
make qdrant-start       # Start Qdrant container
make qdrant-stop        # Stop and remove container
make qdrant-restart     # Restart container
make qdrant-logs        # Follow Qdrant logs
```

### Installation
```bash
make deps               # Install npm dependencies
make install            # Build and link globally
make uninstall          # Remove global installation
make reinstall          # Uninstall + Install
```

### Cleanup
```bash
make clean              # Remove dist/ and tsbuildinfo
make clean-all          # Also remove node_modules/
```

### Version Management
```bash
make version            # Show current version
make release-patch      # Bump 0.0.X
make release-minor      # Bump 0.X.0
make release-major      # Bump X.0.0
```

## Environment Variables
- `MGREP_OPENAI_API_KEY` - OpenAI API key
- `MGREP_ANTHROPIC_API_KEY` - Anthropic API key
- `MGREP_GOOGLE_API_KEY` - Google AI API key
- `MGREP_TAVILY_API_KEY` - Tavily web search API key
- `MGREP_QDRANT_API_KEY` - Qdrant API key (optional)
- `MGREP_IS_TEST=1` - Use TestStore (in-memory) instead of Qdrant

## Helpful Make Target
```bash
make help               # Show all available make targets
```
