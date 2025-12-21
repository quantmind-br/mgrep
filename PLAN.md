# Plano de Implementação: Ferramentas MCP Completas

## Sumário Executivo

Este documento detalha o plano para completar as ferramentas MCP do mgrep, adicionando ferramentas de utilidade e introspecção de arquivos às 4 ferramentas já implementadas.

**Estado Atual**: O servidor MCP já possui 4 ferramentas funcionais:
| Ferramenta | Descrição |
|------------|-----------|
| `mgrep-search` | Busca semântica com filtro por path e reranking |
| `mgrep-ask` | RAG com citações de fontes |
| `mgrep-web-search` | Busca web via Tavily |
| `mgrep-sync` | Sincronização de arquivos com o store |

**Objetivo**: Adicionar 4 ferramentas de utilidade, atingir 80%+ de cobertura de testes, e atualizar documentação.

---

## Fase 1: Novas Ferramentas

### 1.1 `mgrep-get-file`

**Propósito**: Recuperar conteúdo de arquivo com suporte a range de linhas e proteções de segurança.

```typescript
{
  name: "mgrep-get-file",
  description: "Retrieve file content with optional line range. Returns truncated content for large files.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Absolute or relative path to the file" },
      start_line: { type: "number", description: "Starting line (1-indexed)", minimum: 1 },
      end_line: { type: "number", description: "Ending line (inclusive)", minimum: 1 }
    },
    required: ["path"]
  }
}
```

**Implementação** (`src/commands/watch_mcp.ts`):

```typescript
case "mgrep-get-file": {
  const filePath = args?.path as string;
  const startLine = args?.start_line as number | undefined;
  const endLine = args?.end_line as number | undefined;

  if (!filePath) {
    throw new McpError(ErrorCode.InvalidParams, "Path parameter is required");
  }

  // Resolve path and validate
  const resolved = filePath.startsWith("/")
    ? filePath
    : normalize(join(root, filePath));

  // Security: Prevent path traversal
  if (!resolved.startsWith(root)) {
    throw new McpError(ErrorCode.InvalidParams, "Path must be within project root");
  }

  // Security: Check symlinks don't escape root
  try {
    const stats = await fs.promises.lstat(resolved);
    if (stats.isSymbolicLink()) {
      const realPath = await fs.promises.realpath(resolved);
      if (!realPath.startsWith(root)) {
        throw new McpError(ErrorCode.InvalidParams, "Symlink points outside project root");
      }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new McpError(ErrorCode.InvalidParams, `File not found: ${filePath}`);
    }
    throw error;
  }

  const MAX_LINES = 2000;
  const MAX_BYTES = 100 * 1024; // 100KB

  const stat = await fs.promises.stat(resolved);
  const content = await fs.promises.readFile(resolved, "utf-8");
  const lines = content.split("\n");

  let resultLines = lines;
  let truncated = false;

  // Apply line range filter
  if (startLine || endLine) {
    const start = (startLine ?? 1) - 1;
    const end = endLine ?? lines.length;
    resultLines = lines.slice(start, end);
  }

  // Apply size limits with truncation
  if (resultLines.length > MAX_LINES || stat.size > MAX_BYTES) {
    resultLines = resultLines.slice(0, MAX_LINES);
    truncated = true;
  }

  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        path: resolved.replace(root, "."),
        content: resultLines.join("\n"),
        total_lines: lines.length,
        returned_lines: resultLines.length,
        truncated,
        size_bytes: stat.size,
        modified_at: stat.mtime.toISOString(),
        ...(truncated && { hint: "Use start_line/end_line to read specific sections" })
      }, null, 2)
    }]
  };
}
```

**Testes**:
- Recuperar arquivo existente completo
- Recuperar arquivo com range de linhas
- Truncamento automático de arquivos grandes
- Erro para arquivo inexistente
- Erro para path traversal (`../../../etc/passwd`)
- Erro para symlink apontando fora do root

---

### 1.2 `mgrep-list-files`

**Propósito**: Listar arquivos indexados com filtros e paginação.

```typescript
{
  name: "mgrep-list-files",
  description: "List indexed files with optional path filtering and pagination.",
  inputSchema: {
    type: "object",
    properties: {
      path_prefix: { type: "string", description: "Filter by path prefix (e.g., 'src/lib')" },
      limit: { type: "number", description: "Max files to return", default: 50, minimum: 1, maximum: 200 },
      offset: { type: "number", description: "Skip N files (pagination)", default: 0, minimum: 0 },
      include_hash: { type: "boolean", description: "Include file hash", default: false }
    }
  }
}
```

**Implementação**:

```typescript
case "mgrep-list-files": {
  const pathPrefix = args?.path_prefix as string | undefined;
  const limit = Math.min((args?.limit as number) ?? 50, 200);
  const offset = (args?.offset as number) ?? 0;
  const includeHash = (args?.include_hash as boolean) ?? false;

  const absolutePrefix = pathPrefix
    ? pathPrefix.startsWith("/") ? pathPrefix : normalize(join(root, pathPrefix))
    : root;

  const files: Array<{ path: string; hash?: string }> = [];
  let skipped = 0;

  for await (const file of store.listFiles(options.store, { pathPrefix: absolutePrefix })) {
    if (skipped < offset) {
      skipped++;
      continue;
    }
    if (files.length >= limit) break;

    const relativePath = file.metadata?.path?.replace(root, ".") ?? file.external_id ?? "unknown";
    files.push({
      path: relativePath,
      ...(includeHash && file.metadata?.hash ? { hash: file.metadata.hash } : {})
    });
  }

  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        files,
        count: files.length,
        offset,
        has_more: files.length === limit
      }, null, 2)
    }]
  };
}
```

**Nota**: `TestStore.listFiles` já implementa `pathPrefix` corretamente (verificado em `src/lib/store.ts:284-302`).

**Testes**:
- Listar todos os arquivos
- Filtrar por path_prefix
- Paginação com offset/limit
- Verificar include_hash

---

### 1.3 `mgrep-get-context`

**Propósito**: Obter contexto expandido ao redor de uma linha específica.

```typescript
{
  name: "mgrep-get-context",
  description: "Get expanded context around a specific line in a file.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Path to the file" },
      line: { type: "number", description: "Center line number (1-indexed)", minimum: 1 },
      context_lines: { type: "number", description: "Lines before/after", default: 20, minimum: 1, maximum: 100 }
    },
    required: ["path", "line"]
  }
}
```

**Implementação**:

```typescript
case "mgrep-get-context": {
  const filePath = args?.path as string;
  const centerLine = args?.line as number;
  const contextLines = Math.min((args?.context_lines as number) ?? 20, 100);

  if (!filePath || !centerLine) {
    throw new McpError(ErrorCode.InvalidParams, "path and line are required");
  }

  const resolved = filePath.startsWith("/")
    ? filePath
    : normalize(join(root, filePath));

  if (!resolved.startsWith(root)) {
    throw new McpError(ErrorCode.InvalidParams, "Path must be within project root");
  }

  const content = await fs.promises.readFile(resolved, "utf-8");
  const lines = content.split("\n");

  if (centerLine > lines.length) {
    throw new McpError(ErrorCode.InvalidParams, `Line ${centerLine} exceeds file length (${lines.length})`);
  }

  const start = Math.max(0, centerLine - 1 - contextLines);
  const end = Math.min(lines.length, centerLine - 1 + contextLines + 1);
  const contextSlice = lines.slice(start, end);

  // Add line numbers
  const numberedLines = contextSlice.map((line, i) => {
    const lineNum = start + i + 1;
    const marker = lineNum === centerLine ? ">" : " ";
    return `${marker}${String(lineNum).padStart(4)} | ${line}`;
  });

  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        path: resolved.replace(root, "."),
        center_line: centerLine,
        start_line: start + 1,
        end_line: end,
        total_lines: lines.length,
        context: numberedLines.join("\n")
      }, null, 2)
    }]
  };
}
```

**Testes**:
- Contexto no meio do arquivo
- Contexto no início (edge case)
- Contexto no final (edge case)
- Erro para linha fora do range

---

### 1.4 `mgrep-stats`

**Propósito**: Estatísticas do store indexado.

```typescript
{
  name: "mgrep-stats",
  description: "Get statistics about the indexed store.",
  inputSchema: { type: "object", properties: {} }
}
```

**Implementação**:

```typescript
case "mgrep-stats": {
  let fileCount = 0;
  for await (const _ of store.listFiles(options.store)) {
    fileCount++;
  }

  const info = await store.getInfo(options.store);

  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        store_name: info.name,
        description: info.description,
        file_count: fileCount,
        created_at: info.created_at,
        updated_at: info.updated_at,
        pending_operations: info.counts.pending,
        in_progress_operations: info.counts.in_progress,
        root_path: root
      }, null, 2)
    }]
  };
}
```

---

## Fase 2: Testes

### 2.1 Estrutura de Testes

Expandir `src/commands/watch_mcp.test.ts` com os seguintes grupos:

```typescript
describe("MCP Tools", () => {
  describe("mgrep-search", () => {
    it("should return search results with correct format");
    it("should filter by path when specified");
    it("should respect max_results parameter");
    it("should include content when include_content is true");
    it("should handle empty results gracefully");
    it("should throw McpError for missing query");
  });

  describe("mgrep-ask", () => {
    it("should return answer with citations");
    it("should filter by path when specified");
    it("should throw McpError for missing question");
  });

  describe("mgrep-web-search", () => {
    it("should return web results with URLs");
    it("should handle Tavily API errors gracefully");
    it("should throw McpError for missing query");
  });

  describe("mgrep-sync", () => {
    it("should return sync summary");
    it("should support dry_run mode");
  });

  describe("mgrep-get-file", () => {
    it("should return file content");
    it("should support line range filtering");
    it("should truncate large files with warning");
    it("should throw McpError for non-existent file");
    it("should prevent path traversal attacks");
    it("should block symlinks pointing outside root");
  });

  describe("mgrep-list-files", () => {
    it("should list all indexed files");
    it("should filter by path_prefix");
    it("should paginate results correctly");
  });

  describe("mgrep-get-context", () => {
    it("should return expanded context with line numbers");
    it("should handle edge cases (start/end of file)");
    it("should mark center line");
  });

  describe("mgrep-stats", () => {
    it("should return store statistics");
  });
});

describe("Security", () => {
  it("should prevent path traversal in all file tools");
  it("should block symlinks escaping project root");
  it("should respect file system boundaries");
});
```

### 2.2 Meta de Cobertura

| Componente | Meta |
|------------|------|
| `watch_mcp.ts` | 80% |
| Ferramentas existentes | 85% |
| Novas ferramentas | 90% |
| Validações de segurança | 100% |

---

## Fase 3: Documentação

### 3.1 README.md

Atualizar seção "MCP Server" (linhas ~161-165):

```markdown
### MCP Server
- **Transport**: Standard Input/Output (Stdio)
- **Behavior**: Automatically initializes file watcher upon startup

#### Available Tools

| Tool | Description |
|------|-------------|
| `mgrep-search` | Semantic search with path filtering and reranking |
| `mgrep-ask` | RAG Q&A with source citations |
| `mgrep-web-search` | Web search via Tavily (requires API key) |
| `mgrep-sync` | Sync local files with vector store |
| `mgrep-get-file` | Retrieve file content with line range support |
| `mgrep-list-files` | List indexed files with pagination |
| `mgrep-get-context` | Get expanded context around a line |
| `mgrep-stats` | Get store statistics |

#### Configuration for Claude Desktop

```json
// Option 1: Via npx (if package is published)
{
  "mcpServers": {
    "mgrep": {
      "command": "npx",
      "args": ["mgrep", "mcp"],
      "cwd": "/path/to/your/project"
    }
  }
}

// Option 2: Direct execution (local development)
{
  "mcpServers": {
    "mgrep": {
      "command": "node",
      "args": ["/absolute/path/to/mgrep/dist/src/index.js", "mcp"],
      "cwd": "/path/to/your/project"
    }
  }
}
```
```

### 3.2 CLAUDE.md

Adicionar ao final:

```markdown
## MCP Server Tools

The MCP server (`npm run start -- mcp`) exposes 8 tools:

### Core Tools
- **mgrep-search**: `query`, `path?`, `max_results?`, `include_content?`, `rerank?`
- **mgrep-ask**: `question`, `path?`, `max_results?`, `rerank?`
- **mgrep-web-search**: `query`, `max_results?`, `include_content?`
- **mgrep-sync**: `dry_run?`

### Utility Tools
- **mgrep-get-file**: `path`, `start_line?`, `end_line?`
- **mgrep-list-files**: `path_prefix?`, `limit?`, `offset?`, `include_hash?`
- **mgrep-get-context**: `path`, `line`, `context_lines?`
- **mgrep-stats**: (no parameters)

### Testing MCP Tools
```bash
npx @anthropic-ai/mcp-inspector
```
```

---

## Fase 4: Implementação

### Sprint 1: Ferramentas de Arquivo
- [ ] Implementar `mgrep-get-file` com proteções de segurança
- [ ] Implementar `mgrep-list-files`
- [ ] Testes unitários para ambas
- [ ] Testes de segurança (path traversal, symlinks)

### Sprint 2: Ferramentas de Contexto
- [ ] Implementar `mgrep-get-context`
- [ ] Implementar `mgrep-stats`
- [ ] Testes para ferramentas existentes
- [ ] Refatorar tratamento de erros (helpers)

### Sprint 3: Documentação e Qualidade
- [ ] Atualizar README.md
- [ ] Atualizar CLAUDE.md
- [ ] Atualizar AGENTS.md
- [ ] Verificar cobertura (meta: 80%)
- [ ] Testar com MCP Inspector e Claude Desktop

---

## Critérios de Aceite

### Funcionais
1. Todas as 8 ferramentas operacionais
2. Claude Desktop consegue usar todas as ferramentas
3. Erros retornados em formato JSON-RPC válido

### Segurança
1. Path traversal bloqueado em todas as ferramentas de arquivo
2. Symlinks maliciosos detectados e bloqueados
3. Arquivos grandes truncados com aviso

### Qualidade
1. Cobertura de testes >= 80%
2. Tempo de resposta < 5s para operações normais
3. Documentação atualizada

---

## Riscos e Mitigações

| Risco | Impacto | Mitigação |
|-------|---------|-----------|
| Path traversal attacks | Alto | Validação com `realpath` para symlinks |
| Arquivos muito grandes | Médio | Truncamento automático com `MAX_LINES=2000` |
| Timeout em buscas complexas | Médio | Limites de `max_results` nos schemas |
| Incompatibilidade MCP SDK | Alto | Fixar versão do SDK em `package.json` |

---

## Arquivos Afetados

| Arquivo | Alteração |
|---------|-----------|
| `src/commands/watch_mcp.ts` | Adicionar 4 ferramentas + helpers de segurança |
| `src/commands/watch_mcp.test.ts` | Expandir testes significativamente |
| `README.md` | Atualizar seção MCP |
| `CLAUDE.md` | Adicionar seção MCP Tools |
| `AGENTS.md` | Adicionar seção MCP Integration |

---

*Última atualização: 2025-12-21 | Versão 1.1*
