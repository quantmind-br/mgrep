# Sugestões de Melhorias para mgrep

> Documento gerado em 2025-12-27 com análise de MCP best practices e comparação com servidores populares (filesystem, git, memory).

## Resumo Executivo

O mgrep já tem uma base sólida com 8 ferramentas MCP. No entanto, faltam capacidades críticas que servidores MCP maduros oferecem. As melhorias abaixo tornariam o mgrep significativamente mais útil para agentes de codificação.

### Ferramentas Atuais (8 Tools)
- **Search & RAG**: `mgrep-search`, `mgrep-ask`, `mgrep-web-search`
- **File Operations**: `mgrep-get-file`, `mgrep-list-files`, `mgrep-get-context`
- **Maintenance**: `mgrep-sync`, `mgrep-stats`

---

## Tier 1 — Crítico (Alto Impacto)

### 1. Expor Resources (MCP Primitivo)

**Problema**: mgrep só expõe Tools, mas não Resources. Agentes não conseguem "navegar" o codebase indexado.

**Solução**:
```typescript
// Adicionar ao watch_mcp.ts
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  const files = [];
  for await (const file of store.listFiles(storeId)) {
    files.push({
      uri: `mgrep://file/${file.metadata?.path}`,
      name: file.metadata?.path,
      mimeType: "text/plain",
      description: `Indexed file with ${file.chunks} chunks`
    });
  }
  return { resources: files };
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const path = request.params.uri.replace('mgrep://file/', '');
  const content = await fs.readFile(path, 'utf-8');
  return { contents: [{ uri: request.params.uri, mimeType: "text/plain", text: content }] };
});
```

**Impacto**: Agentes podem listar e acessar arquivos indexados sem chamar ferramentas.

---

### 2. Tool Annotations (readOnly, idempotent, destructive)

**Problema**: Agentes não sabem quais ferramentas são seguras para executar automaticamente.

**Solução**:
```typescript
const MGREP_TOOLS: Tool[] = [
  {
    name: "mgrep-search",
    annotations: { readOnlyHint: true },
    // ...
  },
  {
    name: "mgrep-sync",
    annotations: { 
      readOnlyHint: false, 
      idempotentHint: true,
      destructiveHint: false 
    },
    // ...
  },
];
```

**Impacto**: Claude e outros agentes podem auto-aprovar operações read-only.

---

### 3. `mgrep-find-symbol` — Busca por Símbolos

**Problema**: Busca semântica é ótima para conceitos, mas agentes frequentemente precisam encontrar definições específicas (funções, classes, tipos).

**Solução**:
```typescript
{
  name: "mgrep-find-symbol",
  description: "Find symbol definitions (functions, classes, types) by name",
  inputSchema: {
    type: "object",
    properties: {
      name: { type: "string", description: "Symbol name (exact or partial)" },
      type: { 
        type: "string", 
        enum: ["function", "class", "interface", "type", "variable", "any"],
        default: "any"
      },
      path: { type: "string", description: "Optional path filter" }
    },
    required: ["name"]
  }
}
```

**Impacto**: Agentes podem localizar definições rapidamente sem depender apenas de busca semântica.

---

### 4. `mgrep-find-references` — Encontrar Usos

**Problema**: Agentes precisam saber onde um símbolo é usado para refatorações seguras.

**Solução**:
```typescript
{
  name: "mgrep-find-references",
  description: "Find all references/usages of a symbol across the codebase",
  inputSchema: {
    type: "object",
    properties: {
      symbol: { type: "string", description: "Symbol to find references for" },
      path: { type: "string", description: "File where symbol is defined (optional)" },
      include_definition: { type: "boolean", default: false }
    },
    required: ["symbol"]
  }
}
```

**Impacto**: Suporta refatorações, renomeações e análise de impacto.

---

## Tier 2 — Importante (Médio Impacto)

### 5. Prompts (Templates de Workflow)

**Problema**: Agentes precisam descobrir como usar o mgrep efetivamente.

**Solução**:
```typescript
const MGREP_PROMPTS = [
  {
    name: "codebase-overview",
    description: "Get a comprehensive overview of the codebase structure and architecture"
  },
  {
    name: "find-implementation",
    description: "Find how a specific feature is implemented",
    arguments: [{ name: "feature", required: true }]
  },
  {
    name: "debug-flow",
    description: "Trace the execution flow for debugging",
    arguments: [{ name: "entrypoint", required: true }]
  },
  {
    name: "find-similar-code",
    description: "Find code similar to a given snippet",
    arguments: [{ name: "code", required: true }]
  }
];
```

**Impacto**: Workflows guiados para tarefas comuns de desenvolvimento.

---

### 6. `mgrep-tree` — Estrutura de Diretórios

**Problema**: Agentes precisam entender a estrutura do projeto antes de buscar.

**Solução**:
```typescript
{
  name: "mgrep-tree",
  description: "Get a tree view of indexed files, grouped by directory",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Root path for tree" },
      depth: { type: "number", default: 3, description: "Max depth to display" },
      show_file_count: { type: "boolean", default: true }
    }
  }
}

// Output example:
// src/
//   commands/ (3 files)
//     search.ts
//     watch.ts
//     watch_mcp.ts
//   lib/ (12 files)
//     providers/ (6 files)
//     config.ts
//     context.ts
//     ...
```

**Impacto**: Contexto estrutural antes de busca semântica.

---

### 7. `mgrep-diff` — Comparar Versões

**Problema**: Agentes precisam entender mudanças entre versões para code review.

**Solução**:
```typescript
{
  name: "mgrep-diff",
  description: "Compare indexed content with current file content",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "File path" },
      context_lines: { type: "number", default: 3 }
    },
    required: ["path"]
  }
}
```

**Impacto**: Detectar mudanças não sincronizadas, útil para code review.

---

### 8. `mgrep-search-regex` — Busca por Padrão

**Problema**: Às vezes busca literal/regex é mais precisa que semântica.

**Solução**:
```typescript
{
  name: "mgrep-search-regex",
  description: "Search using regex patterns (literal search, not semantic)",
  inputSchema: {
    type: "object",
    properties: {
      pattern: { type: "string", description: "Regex pattern" },
      path: { type: "string" },
      case_sensitive: { type: "boolean", default: false },
      max_results: { type: "number", default: 20 }
    },
    required: ["pattern"]
  }
}
```

**Impacto**: Complementa busca semântica com busca precisa.

---

### 9. Filtros Avançados na Busca

**Problema**: Agentes não conseguem filtrar por tipo de arquivo ou excluir padrões.

**Melhoria** (adicionar aos tools existentes):
```typescript
// Em mgrep-search e mgrep-ask
{
  file_extensions: {
    type: "array",
    items: { type: "string" },
    description: "Filter by extensions (e.g., ['.ts', '.tsx'])"
  },
  exclude_patterns: {
    type: "array", 
    items: { type: "string" },
    description: "Glob patterns to exclude (e.g., ['*.test.ts', '**/node_modules/**'])"
  }
}
```

**Impacto**: Buscas mais precisas, menos ruído.

---

## Tier 3 — Nice to Have (Menor Impacto)

### 10. `mgrep-batch-search` — Busca em Lote

```typescript
{
  name: "mgrep-batch-search",
  description: "Execute multiple semantic searches in parallel",
  inputSchema: {
    type: "object",
    properties: {
      queries: {
        type: "array",
        items: { type: "string" },
        maxItems: 10
      }
    },
    required: ["queries"]
  }
}
```

**Impacto**: Eficiência para exploração ampla do codebase.

---

### 11. `mgrep-related` — Arquivos Relacionados

```typescript
{
  name: "mgrep-related",
  description: "Find files semantically related to a given file",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Reference file path" },
      max_results: { type: "number", default: 5 }
    },
    required: ["path"]
  }
}
```

**Impacto**: Descoberta de dependências implícitas e arquivos relacionados.

---

### 12. `mgrep-explain` — Explicar Código

```typescript
{
  name: "mgrep-explain",
  description: "Get AI explanation of a code section with full codebase context",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string" },
      start_line: { type: "number" },
      end_line: { type: "number" },
      context: { type: "string", description: "Additional context/question" }
    },
    required: ["path", "start_line", "end_line"]
  }
}
```

**Impacto**: RAG focado em explicar trechos específicos.

---

### 13. Write Operations (Opcional)

```typescript
// APENAS se mgrep quiser ser um agente de edição
{
  name: "mgrep-write-file",
  description: "Write content to file and re-index (USE WITH CAUTION)",
  annotations: { destructiveHint: true },
  inputSchema: {
    path: { type: "string" },
    content: { type: "string" },
    create_if_missing: { type: "boolean", default: false }
  }
}
```

**Nota**: Filesystem MCP server já faz isso bem. Talvez mgrep deva focar em leitura/busca.

---

## Resumo de Prioridades

| Prioridade | Feature | Esforço | Impacto |
|------------|---------|---------|---------|
| P0 | Resources (ListResources, ReadResource) | Médio | Alto |
| P0 | Tool Annotations | Baixo | Alto |
| P0 | `mgrep-find-symbol` | Médio | Alto |
| P0 | `mgrep-find-references` | Médio | Alto |
| P1 | Prompts | Baixo | Médio |
| P1 | `mgrep-tree` | Baixo | Médio |
| P1 | Filtros avançados (extensions, exclude) | Baixo | Médio |
| P1 | `mgrep-search-regex` | Médio | Médio |
| P1 | `mgrep-diff` | Médio | Médio |
| P2 | `mgrep-batch-search` | Baixo | Baixo |
| P2 | `mgrep-related` | Médio | Baixo |
| P2 | `mgrep-explain` | Médio | Baixo |

---

## Arquitetura Sugerida

```
mgrep MCP Server
├── Resources (browsable indexed files)
├── Prompts (workflow templates)
└── Tools
    ├── Search
    │   ├── mgrep-search (semantic)
    │   ├── mgrep-search-regex (literal)
    │   ├── mgrep-find-symbol
    │   ├── mgrep-find-references
    │   └── mgrep-batch-search
    ├── Navigation
    │   ├── mgrep-tree
    │   ├── mgrep-related
    │   ├── mgrep-get-file
    │   ├── mgrep-get-context
    │   └── mgrep-list-files
    ├── RAG
    │   ├── mgrep-ask
    │   ├── mgrep-explain
    │   └── mgrep-web-search
    └── Maintenance
        ├── mgrep-sync
        ├── mgrep-diff
        └── mgrep-stats
```

---

## Referências

- [MCP Best Practices](https://mcpcat.io/blog/mcp-server-best-practices)
- [MCP Architecture Guide](https://www.getknit.dev/blog/mcp-architecture-deep-dive-tools-resources-and-prompts-explained)
- [Official MCP Spec](https://modelcontextprotocol.io/specification/2025-03-26/server)
- [Filesystem MCP Server](https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem)
