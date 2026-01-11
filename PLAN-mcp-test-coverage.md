# Plano de Implementação: Cobertura de Testes MCP (80%+)

## Resumo Executivo

Este plano visa aumentar a cobertura de testes do servidor MCP em `src/commands/watch_mcp.ts` de **0.86%** para **80%+**, conforme exigido pelo plano original. O atual arquivo de testes (`watch_mcp.test.ts`) contém apenas 12 testes superficiais que verificam a estrutura do comando mas não exercem os handlers das 8 ferramentas MCP.

**Valor Entregue**: Confiança na implementação, detecção de regressões, e verificação de que as medidas de segurança funcionam corretamente.

---

## Análise de Requisitos

### Requisitos Funcionais
- [ ] Testar todos os 8 handlers de ferramentas MCP (search, ask, web-search, sync, get-file, list-files, get-context, stats)
- [ ] Testar validações de segurança (path traversal, symlinks, truncamento)
- [ ] Testar tratamento de erros (parâmetros inválidos, exceções)
- [ ] Testar casos de borda (arquivos grandes, ranges inválidos, resultados vazios)
- [ ] Testar formatação de respostas JSON-RPC
- [ ] Criar testes de integração E2E com MCP Inspector

### Requisitos Não-Funcionais
- [ ] Performance: Testes devem executar em < 5 segundos
- [ ] Manutenibilidade: Código de teste deve seguir padrões do projeto
- [ ] Cobertura: 80%+ de cobertura para watch_mcp.ts
- [ ] Confiabilidade: Testes devem ser determinísticos (não flaky)

---

## Análise Técnica

### Arquitetura Proposta

```
┌─────────────────────────────────────────────────────────────────┐
│                        watch_mcp.test.ts                        │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────────┐  ┌──────────────────┐  ┌───────────────┐ │
│  │  Unit Tests      │  │  Integration     │  │  E2E Tests    │ │
│  │  (Handler Logic) │  │  (MCP SDK)       │  │  (Inspector)  │ │
│  └──────────────────┘  └──────────────────┘  └───────────────┘ │
│           │                      │                     │        │
│           ▼                      ▼                     ▼        │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │              Mocks (Store, FileSystem, Config)            │ │
│  └───────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### Componentes Afetados

| Arquivo/Módulo | Tipo de Mudança | Descrição |
|----------------|-----------------|-----------|
| `src/commands/watch_mcp.test.ts` | Modificar (completo rewrite) | Reescrever com testes abrangentes |
| `src/commands/watch_mcp.ts` | Sem mudanças | Código sob teste |
| `vitest.config.ts` | Possivelmente modificar | Adicionar setup para testes E2E |

### Dependências

**Dependências Existentes:**
- `vitest` - Framework de teste
- `@vitest/coverage-v8` - Coverage reporting
- `@modelcontextprotocol/sdk` - MCP SDK (já mockado)

**Dependências Novas:**
- Nenhuma necessária

**Dependências de Testes:**
- Testes unitários dependem de mocks existentes
- Testes E2E dependem de `@anthropic-ai/mcp-inspector` (já instalado)

---

## Plano de Implementação

### Fase 1: Refatoração da Base de Testes

**Objetivo**: Criar infraestrutura de teste robusta e reutilizável

#### Tarefa 1.1: Criar Setup de Teste Compartilhado

**Descrição**: Extrair setup comum para `beforeEach`/`afterEach` para reduzir duplicação

**Arquivos envolvidos**: `src/commands/watch_mcp.test.ts`

**Código de exemplo**:

```typescript
// Test fixtures e helpers
interface MockStore {
  search: ReturnType<typeof vi.fn>;
  ask: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  retrieve: ReturnType<typeof vi.fn>;
  listFiles: ReturnType<typeof vi.fn>;
  getStats: ReturnType<typeof vi.fn>;
}

function createMockStore(): MockStore {
  return {
    search: vi.fn(),
    ask: vi.fn(),
    create: vi.fn(),
    retrieve: vi.fn(),
    listFiles: vi.fn().mockReturnValue(async function* () { /* generator */ }),
    getStats: vi.fn(),
  };
}

function createMockRequestHandler() {
  const handlers: Record<string, ReturnType<typeof vi.fn>> = {};

  const mockServer = {
    setRequestHandler: vi.fn((schema, handler) => {
      const schemaName = schema.description ?? 'unknown';
      handlers[schemaName] = handler;
    }),
    getHandler: (schemaName: string) => handlers[schemaName],
    connect: vi.fn(),
    onerror: vi.fn(),
  };

  return mockServer;
}
```

#### Tarefa 1.2: Criar Helper de Tool Invocation

**Descrição**: Criar função auxiliar para invocar tools MCP como se fossem chamadas pelo cliente

**Arquivos envolvidos**: `src/commands/watch_mcp.test.ts`

**Código de exemplo**:

```typescript
// Helper para invocar tools
async function invokeTool(
  handler: (request: CallToolRequest) => Promise<ToolResponse>,
  name: string,
  args?: Record<string, unknown>
): Promise<ToolResponse> {
  return handler({
    params: {
      name,
      arguments: args ?? {},
    },
  } as CallToolRequest);
}
```

---

### Fase 2: Testes Unitários dos Handlers

**Objetivo**: Testar a lógica de cada handler independente do MCP SDK

#### Tarefa 2.1: Testar mgrep-search

**Descrição**: Testar semantic search com validações e filtros

**Arquivos envolvidos**: `src/commands/watch_mcp.test.ts`

**Casos de teste**:

| ID | Cenário | Input | Output Esperado |
|----|---------|-------|-----------------|
| TS01 | Busca básica com query válido | `{query: "test"}` | Resultados formatados |
| TS02 | Query vazio retorna erro | `{query: ""}` | McpError InvalidParams |
| TS03 | Path filter relativo | `{query: "test", path: "src/lib"}` | Path normalizado |
| TS04 | Path filter absoluto | `{query: "test", path: "/abs/path"}` | Mantém absoluto |
| TS05 | max_results clamping | `{query: "test", max_results: 100}` | Usa padrão 10 |
| TS06 | Include content true | `{query: "test", include_content: true}` | Resultados com conteúdo |
| TS07 | Sem resultados | Store retorna vazio | "No results found" |
| TS08 | Rerank habilitado | `{query: "test", rerank: true}` | Chama store com rerank |

**Código de exemplo**:

```typescript
describe("mgrep-search tool", () => {
  it("should return formatted results for valid query", async () => {
    const mockStore = createMockStore();
    mockStore.search.mockResolvedValue({
      data: [{
        type: "text",
        text: "content",
        score: 0.9,
        filename: "/root/test.ts",
        chunk_index: 0,
        metadata: { path: "/root/test.ts", hash: "abc" },
        generated_metadata: { start_line: 0, num_lines: 10 },
      }],
    });

    const result = await invokeTool(handler, "mgrep-search", { query: "test" });

    expect(result.content[0].type).toBe("text");
    expect(result.content[0].text).toContain("Found 1 result");
  });

  it("should throw McpError for missing query", async () => {
    await expect(
      invokeTool(handler, "mgrep-search", {})
    ).rejects.toThrow("Query parameter is required");
  });
});
```

#### Tarefa 2.2: Testar mgrep-ask

**Descrição**: Testar RAG question answering com extração de citações

**Casos de teste**:

| ID | Cenário | Input | Output Esperado |
|----|---------|-------|-----------------|
| TA01 | Pergunta básica | `{question: "What is X?"}` | Resposta com sources |
| TA02 | Pergunta vazia | `{question: ""}` | McpError InvalidParams |
| TA03 | Citação única | Resposta com `<cite i="0">` | Source listado |
| TA04 | Citação com range | Resposta com `<cite i="0-2">` | Sources 0,1,2 listados |
| TA05 | Citações inválidas | `<cite i="999">` | Ignora fora do range |
| TA06 | Path filter aplicado | `{question: "X", path: "src"}` | Filtra por path |

#### Tarefa 2.3: Testar mgrep-web-search

**Descrição**: Testar busca web via Tavily

**Casos de teste**:

| ID | Cenário | Input | Output Esperado |
|----|---------|-------|-----------------|
| TW01 | Busca web bem-sucedida | `{query: "TypeScript"}` | Resultados formatados |
| TW02 | Query vazio | `{query: ""}` | McpError |
| TW03 | Sem resultados | Tavily retorna vazio | "No web results found" |
| TW04 | Erro Tavily | API falha | McpError InternalError |
| TW05 | Include content false | `{query: "test", include_content: false}` | Sem snippet de conteúdo |

#### Tarefa 2.4: Testar mgrep-sync

**Descrição**: Testar sincronização de arquivos

**Casos de teste**:

| ID | Cenário | Input | Output Esperado |
|----|---------|-------|-----------------|
| TSY01 | Sync normal | `{dry_run: false}` | Resumo com "synced" |
| TSY02 | Dry run | `{dry_run: true}` | Resumo com "(dry run)" |
| TSY03 | Store não existe | Primeira execução | Cria store antes de sync |
| TSY04 | Arquivos deletados | Sync com deletados | "- Files deleted: N" |
| TSY05 | Erro no sync | initialSync falha | McpError |

#### Tarefa 2.5: Testar mgrep-get-file

**Descrição**: Testar leitura de arquivo com segurança

**Casos de teste**:

| ID | Cenário | Input | Output Esperado |
|----|---------|-------|-----------------|
| TF01 | Arquivo simples | `{path: "test.txt"}` | JSON com content |
| TF02 | Path absoluto válido | `{path: "/root/test.txt"}` | Lê arquivo |
| TF03 | **Path traversal** | `{path: "../../../etc/passwd"}` | **McpError "fora do root"** |
| TF04 | **Symlink para fora** | Symlink para /tmp | **McpError "outside root"** |
| TF05 | Range de linhas | `{path: "f", start_line: 5, end_line: 10}` | Apenas linhas 5-10 |
| TF06 | Arquivo grande | >2000 linhas | Truncado com hint |
| TF07 | Arquivo não existe | `{path: "nonexistent.txt"}` | McpError "File not found" |
| TF08 | Start > end | `{path: "f", start_line: 100, end_line: 50}` | Slice vazio |

**Código de exemplo para security tests**:

```typescript
describe("mgrep-get-file security", () => {
  it("should block path traversal attacks", async () => {
    await expect(
      invokeTool(handler, "mgrep-get-file", { path: "../../../etc/passwd" })
    ).rejects.toThrow("Path must be within project root");
  });

  it("should block symlinks escaping root", async () => {
    // Setup: Create symlink in root pointing outside
    const outsideDir = tmpdir();
    const linkPath = join(root, "escape-link");
    await fs.symlink(outsideDir, linkPath);

    await expect(
      invokeTool(handler, "mgrep-get-file", { path: "escape-link/test.txt" })
    ).rejects.toThrow("Symlink points outside project root");
  });
});
```

#### Tarefa 2.6: Testar mgrep-list-files

**Descrição**: Testar listagem de arquivos com paginação

**Casos de teste**:

| ID | Cenário | Input | Output Esperado |
|----|---------|-------|-----------------|
| TL01 | Listagem básica | `{}` | JSON com files array |
| TL02 | Path prefix filter | `{path_prefix: "src/lib"}` | Filtra por prefixo |
| TL03 | Paginação - limit | `{limit: 10}` | No máximo 10 arquivos |
| TL04 | Paginação - offset | `{offset: 5, limit: 10}` | Pula primeiros 5 |
| TL05 | Include hash | `{include_hash: true}` | Inclui hash no response |
| TL06 | Has more marker | Limit igual a quantidade | `has_more: true` |

#### Tarefa 2.7: Testar mgrep-get-context

**Descrição**: Testar contexto expandido ao redor de uma linha

**Casos de teste**:

| ID | Cenário | Input | Output Esperado |
|----|---------|-------|-----------------|
| TC01 | Contexto padrão | `{path: "f", line: 50}` | 20 linhas antes/depois |
| TC02 | Contexto customizado | `{path: "f", line: 50, context_lines: 5}` | 5 linhas antes/depois |
| TC03 | Linha no início | `{path: "f", line: 1}` | Apenas linhas após |
| TC04 | Linha no final | `{path: "f", line: 1000}` | Apenas linhas antes |
| TC05 | Marker `>` | Contexto retornado | Linha central com `>` |
| TC06 | Path inválido | `{path: "nonexistent", line: 1}` | McpError |
| TC07 | Linha excede arquivo | `{path: "f", line: 9999}` | McpError "exceeds file length" |
| TC08 | Context lines > 100 | `{context_lines: 200}` | Clamped para 100 |

#### Tarefa 2.8: Testar mgrep-stats

**Descrição**: Testar estatísticas do store

**Casos de teste**:

| ID | Cenário | Input | Output Esperado |
|----|---------|-------|-----------------|
| TST01 | Stats básico | `{}` | JSON com store_name, counts, etc |
| TST02 | Store vazio | Store sem arquivos | chunk_count: 0 |

---

### Fase 3: Testes de Segurança

**Objetivo**: Verificar que todas as medidas de segurança funcionam

#### Tarefa 3.1: Testes de Path Traversal

**Descrição**: Criar testes específicos para ataques de path traversal

**Casos de teste**:

| ID | Ataque | Input | Resultado |
|----|--------|-------|-----------|
| SP01 | Parent directory | `{path: "../secret"}` | Bloqueado |
| SP02 | Parent duplo | `{path: "../../etc/passwd"}` | Bloqueado |
| SP03 | Parent múltiplo | `{path: "../../../../../../etc/passwd"}` | Bloqueado |
| SP04 | Parent com prefixo | `{path: "src/../../../etc"}` | Bloqueado |
| SP05 | Path absoluto externo | `{path: "/etc/passwd"}` | Bloqueado |

#### Tarefa 3.2: Testes de Symlink

**Descrição**: Verificar validação de symlinks

**Casos de teste**:

| ID | Cenário | Setup | Resultado |
|----|---------|-------|-----------|
| SS01 | Symlink interno | Link para `/root/subdir` | Permitido |
| SS02 | Symlink externo | Link para `/tmp` | Bloqueado |
| SS03 | Symlink relativo externo | Link para `../../tmp` | Bloqueado |
| SS04 | Symlink em cadeia | A -> B -> /tmp | Bloqueado |
| SS05 | Arquivo via symlink | Symlink para arquivo interno | Permitido |

#### Tarefa 3.3: Testes de Truncamento

**Descrição**: Verificar limites de tamanho de arquivo

**Casos de teste**:

| ID | Cenário | Setup | Resultado |
|----|---------|-------|-----------|
| SL01 | Arquivo exatamente 2000 linhas | 2000 linhas | Sem truncamento |
| SL02 | Arquivo 2001 linhas | 2001 linhas | Truncado com hint |
| SL03 | Arquivo 10000 linhas | 10000 linhas | Truncado para 2000 |
| SL04 | Arquivo 100KB | 100KB | Sem truncamento |
| SL05 | Arquivo 101KB | 101KB | Truncado |
| SL06 | Arquivo grande com range | 5000 linhas, range 100-200 | Sem truncamento |

---

### Fase 4: Testes de Integração

**Objetivo**: Testar integração com MCP SDK real

#### Tarefa 4.1: Testes com MCP SDK Mockado (Mas Completo)

**Descrição**: Usar o MCP SDK mockado mas testar o fluxo completo de request/response

**Arquivos envolvidos**: `src/commands/watch_mcp.test.ts`

**Código de exemplo**:

```typescript
describe("MCP Integration (mocked SDK)", () => {
  it("should handle complete request-response cycle", async () => {
    let capturedHandler: ((req: CallToolRequest) => Promise<ToolResponse>) | null = null;

    const mockServer = {
      setRequestHandler: vi.fn((schema, handler) => {
        capturedHandler = handler;
      }),
      connect: vi.fn(),
      onerror: vi.fn(),
    };

    vi.mocked(Server).mockImplementation(() => mockServer as any);

    // Inicia o servidor MCP
    await watchMcp.action({}, watchMcp);

    // Verifica que handler foi capturado
    expect(capturedHandler).not.toBeNull();

    // Faz uma chamada de tool
    const mockStore = createMockStore();
    mockStore.search.mockResolvedValue({ data: [] });

    const response = await capturedHandler!({
      params: {
        name: "mgrep-search",
        arguments: { query: "test" },
      },
    } as CallToolRequest);

    expect(response.content[0].type).toBe("text");
  });
});
```

#### Tarefa 4.2: Schema Validation Tests

**Descrição**: Verificar que todos os tools têm schemas JSON-RPC válidos

**Casos de teste**:

| ID | Tool | Verificação |
|----|------|-------------|
| SV01 | mgrep-search | Schema tem todas as propriedades obrigatórias |
| SV02 | mgrep-ask | Types corretos (string, number, boolean) |
| SV03 | mgrep-get-file | Min/max constraints definidos |
| SV04 | Todos | Required arrays corretos |

---

### Fase 5: Testes E2E com MCP Inspector

**Objetivo**: Testar com cliente MCP real

#### Tarefa 5.1: Criar Script de Teste E2E

**Descrição**: Criar script manual para testar com MCP Inspector

**Arquivos envolvidos**: `scripts/test-mcp-e2e.sh` (novo)

**Código de exemplo**:

```bash
#!/bin/bash
# scripts/test-mcp-e2e.sh

echo "Starting MCP Inspector E2E tests..."

# Start MCP server in background
npm run start -- mcp &
MCP_PID=$!

# Wait for server to be ready
sleep 2

# Run inspector tests (manual verification expected)
echo "Open MCP Inspector and verify:"
echo "1. All 8 tools appear in tool list"
echo "2. mgrep-search returns results"
echo "3. mgrep-get-file blocks ../etc/passwd"
echo "4. mgrep-stats returns valid JSON"

# Cleanup
kill $MCP_PID
```

#### Tarefa 5.2: Documentar Procedimento de Teste Manual

**Descrição**: Criar checklist para testes manuais com MCP Inspector

**Arquivos envolvidos**: `docs/MCP_TESTING.md` (novo)

**Conteúdo**:

```markdown
# MCP Testing Checklist

## Preparação
1. Inicie o Qdrant: `docker run -p 6333:6333 qdrant/qdrant`
2. Indexe alguns arquivos: `npm run start -- sync`
3. Inicie MCP Inspector: `npx @anthropic-ai/mcp-inspector npm run start -- mcp`

## Testes Manuais

### mgrep-search
- [ ] Query válida retorna resultados
- [ ] Query vazia retorna erro
- [ ] Path filter funciona
- [ ] max_results respeitado

### mgrep-get-file
- [ ] Arquivo existe é retornado
- [ ] Path traversal bloqueado
- [ ] Symlink externo bloqueado
- [ ] Range de linhas funciona

... (continuar para todos os tools)
```

---

## Estratégia de Testes

### Testes Unitários (Target: ~60 testes)

**Estrutura de arquivos**:
```
src/commands/watch_mcp.test.ts
├── describe("mgrep-search tool")
│   ├── describe("successful requests")
│   └── describe("error cases")
├── describe("mgrep-ask tool")
│   └── ...
├── describe("mgrep-get-file tool")
│   ├── describe("successful requests")
│   ├── describe("path validation")
│   ├── describe("security: path traversal")
│   └── describe("security: symlinks")
├── describe("mgrep-list-files tool")
│   └── ...
└── ...
```

### Testes de Integração (Target: ~10 testes)

- Fluxo completo request-response
- Schema validation
- Error handling no nível do MCP SDK

### Casos de Teste Específicos

**Testes de Segurança Críticos** (devem passar sempre):

```typescript
describe("Security: mgrep-get-file", () => {
  const securityTests = [
    { path: "../../../etc/passwd", shouldBlock: true },
    { path: "../../../../../../etc/shadow", shouldBlock: true },
    { path: "/etc/passwd", shouldBlock: true },
    { path: "./../etc/hosts", shouldBlock: true },
  ];

  test.each(securityTests)("blocks path traversal: %s", async ({ path, shouldBlock }) => {
    if (shouldBlock) {
      await expect(
        invokeTool(handler, "mgrep-get-file", { path })
      ).rejects.toThrow("within project root");
    }
  });
});
```

---

## Riscos e Mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|-------|---------------|---------|-----------|
| Mocks complexos podem falhar | Médio | Alto | Criar helpers reutilizáveis para setup |
| Testes de arquivo I/O são lentos | Médio | Baixo | Usar vi.mock() para fs.promises |
| Testes flaky de symlink | Baixo | Médio | Setup/teardown robusto com temp dirs |
| Cobertura 80% difícil de atingir | Baixo | Médio | Focar nos handlers primeiro, depois helpers |
| MCP SDK mudar a API | Baixo | Baixo | Versão fixa no package.json |

---

## Checklist de Conclusão

### Fase 1: Infraestrutura
- [ ] Setup compartilhado criado
- [ ] Helper de tool invocation criado
- [ ] Mock factory functions implementadas

### Fase 2: Handlers (8 tools)
- [ ] mgrep-search: ~8 testes
- [ ] mgrep-ask: ~6 testes
- [ ] mgrep-web-search: ~5 testes
- [ ] mgrep-sync: ~5 testes
- [ ] mgrep-get-file: ~8 testes (incluindo segurança)
- [ ] mgrep-list-files: ~6 testes
- [ ] mgrep-get-context: ~8 testes
- [ ] mgrep-stats: ~2 testes

### Fase 3: Segurança
- [ ] Path traversal: ~5 testes
- [ ] Symlinks: ~5 testes
- [ ] Truncamento: ~6 testes

### Fase 4: Integração
- [ ] MCP SDK integration: ~5 testes
- [ ] Schema validation: ~4 testes

### Fase 5: E2E
- [ ] Script E2E criado
- [ ] Documentação de teste manual criada
- [ ] Teste manual executado pelo menos uma vez

### Validação Final
- [ ] `npm run test:coverage` mostra 80%+ para watch_mcp.ts
- [ ] Todos os testes passam consistentemente
- [ ] Nenhum teste flaky
- [ ] README.md atualizado com nota sobre cobertura

---

## Métricas de Sucesso

| Métrica | Antes | Depois | Target |
|---------|-------|--------|--------|
| Cobertura watch_mcp.ts | 0.86% | TBD | 80%+ |
| Número de testes | 12 | ~60+ | 60+ |
| Testes de segurança | 0 | ~16 | 16+ |
| Testes de integração | 0 | ~10 | 10+ |

---

## Notas Adicionais

### Padrões de Código de Teste

**Nomenclatura**:
- Test files: `<module>.test.ts`
- Describe blocks: Nome da ferramenta ou aspecto testado
- Test names: Deveriam ler como frases completas

**Assertivas**:
- Preferir `expect().rejects.toThrow()` para exceções
- Usar `expect().resolves` para promises resolvidas
- Verificar mensagens de erro específicas para McpError

**Setup/Teardown**:
- Usar `beforeEach` para setup de mocks
- Usar `afterEach` para `vi.clearAllMocks()`
- Usar `beforeAll` para setup pesado (criar arquivos de teste)

### Debugging Testes

Para rodar testes específicos:
```bash
# Apenas watch_mcp tests
npm run test:unit -- watch_mcp

# Apenas um describe block
npm run test:unit -- -t "mgrep-get-file security"

# Com coverage
npm run test:coverage -- watch_mcp
```

### Continuação

Após concluir este plano, considere:
1. Adicionar testes de performance (large file handling)
2. Adicionar testes de concorrência (multiple simultaneous requests)
3. Adicionar testes de mutação (verify error handling robustness)