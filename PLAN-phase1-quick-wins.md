# Plano de Implementacao: Phase 1 Quick Wins

## Resumo Executivo

Este plano agrupa tres melhorias de baixo esforco que podem ser implementadas rapidamente para melhorar a experiencia do usuario: mensagens de estado vazio acionaveis, verificacao de conformidade NO_COLOR, e melhorias menores nas descricoes MCP.

---

## Feature 1: Actionable Empty States for Search

**ID**: uiux-005 | **Priority**: High | **Effort**: Small

### Requisitos Funcionais
- [ ] Detectar quando o store esta vazio (nenhum arquivo indexado)
- [ ] Detectar quando a busca retorna 0 resultados mas o store tem dados
- [ ] Exibir mensagens de ajuda contextuais em ambos os casos
- [ ] Aplicar tanto no CLI (`search.ts`) quanto no MCP (`watch_mcp.ts`)

### Componentes Afetados

| Arquivo | Tipo | Descricao |
|---------|------|-----------|
| `src/commands/search.ts` | Modificar | Adicionar logica de empty state |
| `src/commands/watch_mcp.ts` | Modificar | Adicionar mensagens contextuais |

### Implementacao

#### 1. Modificar `src/commands/watch_mcp.ts`

Localizar o bloco (linha ~105-107):
```typescript
if (response.data.length === 0) {
  return "No results found.";
}
```

Substituir por:
```typescript
if (response.data.length === 0) {
  // Check if store has any data
  try {
    const stats = await store.getStats(options.store);
    if (stats.file_count === 0) {
      return "No files indexed. Run `mgrep sync` or use the mgrep-sync tool first.";
    }
  } catch {
    // Stats failed, provide generic message
  }
  
  return `No matches found for "${query}". Try:
  - Broadening your search query
  - Removing path filters
  - Running mgrep-stats to check indexed file count`;
}
```

#### 2. Aplicar mesmo padrao no mgrep-context (linha ~1623)

```typescript
if (results.data.length === 0) {
  try {
    const stats = await store.getStats(options.store);
    if (stats.file_count === 0) {
      return {
        content: [{
          type: "text",
          text: "No files indexed. Run mgrep-sync first.",
        }],
      };
    }
  } catch {}
  
  return {
    content: [{
      type: "text",
      text: "No matching code found. Try broadening your query.",
    }],
  };
}
```

#### 3. Modificar `src/commands/search.ts`

Adicionar verificacao apos a busca (antes de formatar response):
```typescript
// After search results are obtained
if (results.data.length === 0 && !options.fzf) {
  try {
    const stats = await store.getStats(options.store);
    if (stats.chunk_count === 0) {
      console.log("No files indexed. Run 'mgrep sync' first.");
      return;
    }
  } catch {}
  
  console.log(`No matches found for "${pattern}".`);
  console.log("Try:");
  console.log("  - Broadening your search query");
  if (exec_path) {
    console.log("  - Removing path filters");
  }
  console.log("  - Running 'mgrep stats' to check indexed files");
  return;
}
```

### Testes

| ID | Cenario | Esperado |
|----|---------|----------|
| ES01 | Store vazio | "No files indexed. Run 'mgrep sync' first." |
| ES02 | 0 resultados, store com dados | Mensagem com sugestoes |
| ES03 | Resultados encontrados | Comportamento normal |

---

## Feature 2: Verify NO_COLOR Standard Compliance

**ID**: uiux-004 | **Priority**: Medium | **Effort**: Trivial

### Requisitos Funcionais
- [ ] Verificar que `chalk` respeita NO_COLOR automaticamente
- [ ] Verificar comportamento do `ora` spinner com NO_COLOR
- [ ] Documentar suporte no README

### Analise Tecnica

O `chalk` v5+ automaticamente detecta e respeita:
- `NO_COLOR` environment variable
- `FORCE_COLOR` environment variable
- TTY detection

O `ora` v5+ tambem respeita essas variaveis.

### Implementacao

#### 1. Verificacao Manual (nao requer codigo)

Testar com:
```bash
NO_COLOR=1 mgrep sync
NO_COLOR=1 mgrep search "test"
```

Verificar que:
- Spinner do ora nao mostra cores
- Output de chalk e plain text
- Mensagens de warning/error sao legiveis

#### 2. Adicionar documentacao ao README.md

Adicionar secao:
```markdown
## Accessibility

### NO_COLOR Support

mgrep respects the [NO_COLOR](https://no-color.org/) standard. Set the environment variable to disable all colored output:

```bash
export NO_COLOR=1
mgrep search "query"
```

This is useful for:
- Users with visual impairments requiring high-contrast terminals
- CI/CD pipelines where ANSI codes pollute logs
- Redirecting output to files
```

#### 3. Verificacao de ora (se necessario)

Se o ora nao respeitar NO_COLOR, adicionar workaround em `src/lib/sync-helpers.ts`:

```typescript
import ora from "ora";

export function createIndexingSpinner(root: string, label = "Indexing files..."): IndexingSpinner {
  // ora v5+ respects NO_COLOR automatically
  const spinner = ora({ 
    text: label,
    // Fallback: disable spinner animation if NO_COLOR is set
    isEnabled: !process.env.NO_COLOR,
  }).start();
  
  // ...
}
```

### Testes

| ID | Cenario | Esperado |
|----|---------|----------|
| NC01 | NO_COLOR=1 + mgrep sync | Spinner sem cores, texto plain |
| NC02 | NO_COLOR=1 + mgrep search | Output sem ANSI codes |
| NC03 | Sem NO_COLOR | Cores normais |
| NC04 | FORCE_COLOR=1 + NO_COLOR=1 | FORCE_COLOR tem precedencia (cores) |

---

## Feature 3: Minor MCP Description Enhancements

**ID**: uiux-008 | **Priority**: Low | **Effort**: Trivial

### Requisitos Funcionais
- [ ] Adicionar exemplos inline nos parametros `path`
- [ ] Garantir consistencia entre todas as tools

### Componentes Afetados

| Arquivo | Tipo | Descricao |
|---------|------|-----------|
| `src/commands/watch_mcp.ts` | Modificar | Atualizar descricoes de inputSchema |

### Implementacao

#### Atualizacoes nas descricoes de path

Localizar e atualizar as seguintes descricoes em `MGREP_TOOLS`:

**mgrep-search** (linha ~214):
```typescript
path: {
  type: "string",
  description:
    "Optional path filter to search within a specific directory (e.g., 'src/lib' or 'tests/')",
},
```

**mgrep-ask** (linha ~254):
```typescript
path: {
  type: "string",
  description:
    "Optional path filter to limit the search scope (e.g., 'src/commands' or 'lib/')",
},
```

**mgrep-find-symbol** (linha ~459):
```typescript
path: {
  type: "string",
  description: "Filter to specific directory (e.g., 'src/lib' or 'components/')",
},
```

**mgrep-find-references** (linha ~492):
```typescript
path: {
  type: "string",
  description: "Optional: Limit search to specific directory (e.g., 'src/' or 'tests/')",
},
```

**mgrep-context** (linha ~545):
```typescript
path: {
  type: "string",
  description: "Filter to specific path prefix (e.g., 'src/lib' or 'docs/')",
},
```

**mgrep-list-files** (linha ~363):
```typescript
path_prefix: {
  type: "string",
  description: "Filter by path prefix (e.g., 'src/lib' or 'tests/')",
},
```

### Testes

| ID | Cenario | Esperado |
|----|---------|----------|
| MCP01 | Listar tools | Descricoes incluem exemplos |
| MCP02 | Agents usam path | Menos erros de formato |

---

## Checklist de Conclusao Geral

### Feature 1: Empty States
- [ ] `watch_mcp.ts` atualizado
- [ ] `search.ts` atualizado
- [ ] Testes manuais passando

### Feature 2: NO_COLOR
- [ ] Verificacao manual concluida
- [ ] README atualizado
- [ ] Workaround de ora aplicado (se necessario)

### Feature 3: MCP Descriptions
- [ ] Descricoes atualizadas
- [ ] Consistencia verificada

---

## Ordem de Implementacao Recomendada

1. **Feature 3** (MCP Descriptions) - 15 minutos
   - Menor risco, apenas mudancas de texto
   
2. **Feature 2** (NO_COLOR) - 30 minutos
   - Principalmente verificacao e documentacao
   
3. **Feature 1** (Empty States) - 1 hora
   - Requer logica adicional e testes

---

## Notas Adicionais

### Mensagens de Empty State - Exemplos

**CLI (search.ts):**
```
$ mgrep search "nonexistent query"
No matches found for "nonexistent query".
Try:
  - Broadening your search query
  - Removing path filters
  - Running 'mgrep stats' to check indexed files
```

**MCP (watch_mcp.ts):**
```
No matches found for "nonexistent query". Try:
  - Broadening your search query
  - Removing path filters
  - Running mgrep-stats to check indexed file count
```

### Impacto no AI Agent

Com mensagens mais claras, AI agents poderao:
1. Detectar quando precisam rodar `mgrep-sync` primeiro
2. Entender que a query pode precisar de ajustes
3. Reduzir loops de tentativas com queries similares
