# Plano de Implementacao: Phase 3 Polish Features

## Resumo Executivo

Este plano cobre duas features de polish de baixa prioridade que devem ser implementadas apos coleta de feedback dos usuarios: syntax highlighting opcional para resultados de busca e melhorias menores no progresso de sync.

> **Nota**: Estas features sao de baixa prioridade. Implementar apenas apos validar demanda real dos usuarios.

---

## Feature 1: Syntax Highlighting for Search Results

**ID**: uiux-002 | **Priority**: Low | **Effort**: Small | **Status**: Aguardando feedback

### Requisitos Funcionais
- [ ] Adicionar flag `--highlight` ao comando search
- [ ] Aplicar highlighting apenas quando `--content` tambem esta ativo
- [ ] Detectar linguagem automaticamente pela extensao do arquivo
- [ ] Respeitar NO_COLOR environment variable
- [ ] Nao aplicar highlighting em resultados de web search

### Componentes Afetados

| Arquivo | Tipo | Descricao |
|---------|------|-----------|
| `src/commands/search.ts` | Modificar | Adicionar flag e logica de highlighting |
| `package.json` | Modificar | Adicionar dependencia `cli-highlight` |

### Dependencias a Adicionar

```bash
npm install cli-highlight
```

### Implementacao

#### 1. Adicionar dependencia

```json
{
  "dependencies": {
    "cli-highlight": "^2.1.11"
  }
}
```

#### 2. Adicionar flag ao comando search

```typescript
.option(
  "--highlight",
  "Apply syntax highlighting to code content (requires --content)",
  parseBooleanEnv(process.env.MGREP_HIGHLIGHT, false),
)
```

#### 3. Modificar funcao formatChunk

```typescript
import { highlight } from "cli-highlight";
import { extname } from "node:path";

// Map file extensions to language names
const EXT_TO_LANG: Record<string, string> = {
  ".ts": "typescript",
  ".tsx": "typescript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".py": "python",
  ".rb": "ruby",
  ".go": "go",
  ".rs": "rust",
  ".java": "java",
  ".kt": "kotlin",
  ".swift": "swift",
  ".c": "c",
  ".cpp": "cpp",
  ".h": "c",
  ".hpp": "cpp",
  ".cs": "csharp",
  ".php": "php",
  ".sql": "sql",
  ".sh": "bash",
  ".bash": "bash",
  ".zsh": "bash",
  ".yaml": "yaml",
  ".yml": "yaml",
  ".json": "json",
  ".xml": "xml",
  ".html": "html",
  ".css": "css",
  ".scss": "scss",
  ".md": "markdown",
};

function detectLanguage(filePath: string): string | undefined {
  const ext = extname(filePath).toLowerCase();
  return EXT_TO_LANG[ext];
}

function highlightCode(code: string, filePath: string): string {
  // Respect NO_COLOR
  if (process.env.NO_COLOR) {
    return code;
  }
  
  const language = detectLanguage(filePath);
  if (!language) {
    return code;
  }
  
  try {
    return highlight(code, { language, ignoreIllegals: true });
  } catch {
    return code;
  }
}

function formatChunk(
  chunk: ChunkType, 
  show_content: boolean,
  apply_highlight: boolean = false,
) {
  const pwd = process.cwd();

  if (isWebResult(chunk)) {
    // Web results - no highlighting
    const url = chunk.filename;
    const content = show_content ? chunk.text : "";
    return `${url} (${(chunk.score * 100).toFixed(2)}% match)${content ? `\n${content}` : ""}`;
  }

  const path =
    (chunk.metadata as FileMetadata)?.path?.replace(pwd, "") ?? "Unknown path";
  let line_range = "";
  let content = "";
  
  switch (chunk.type) {
    case "text": {
      const start_line = (chunk.generated_metadata?.start_line ?? 0) + 1;
      const end_line = start_line + (chunk.generated_metadata?.num_lines ?? 0);
      line_range = `:${start_line}-${end_line}`;
      
      if (show_content) {
        const fullPath = (chunk.metadata as FileMetadata)?.path ?? "";
        content = apply_highlight 
          ? highlightCode(chunk.text, fullPath)
          : chunk.text;
      }
      break;
    }
    // ... rest of cases unchanged
  }

  return `.${path}${line_range} (${(chunk.score * 100).toFixed(2)}% match)${content ? `\n${content}` : ""}`;
}
```

#### 4. Atualizar chamadas de formatChunk

```typescript
// In formatSearchResponse:
function formatSearchResponse(
  response: SearchResponse, 
  show_content: boolean,
  apply_highlight: boolean = false,
) {
  return response.data
    .map((chunk) => formatChunk(chunk, show_content, apply_highlight))
    .join("\n");
}

// In action handler:
response = formatSearchResponse(results, options.content, options.highlight);
```

### Testes

| ID | Cenario | Esperado |
|----|---------|----------|
| HL01 | `--content --highlight` com .ts | Codigo TypeScript colorido |
| HL02 | `--content` sem `--highlight` | Codigo plain text |
| HL03 | `--highlight` sem `--content` | Sem efeito (content nao exibido) |
| HL04 | `NO_COLOR=1 --highlight` | Codigo plain text |
| HL05 | Arquivo sem extensao conhecida | Codigo plain text |
| HL06 | Web result com `--highlight` | Sem highlighting |

---

## Feature 2: Enhanced Sync Progress

**ID**: uiux-006 | **Priority**: Low | **Effort**: Trivial

### Analise do Estado Atual

O sistema atual ja fornece bom feedback via `ora` spinner:
```
Indexing files (45/120) • uploaded 10 • deleted 2 ./src/lib/store.ts
```

### Melhorias Propostas (Opcional)

#### 1. Adicionar ETA baseado em tempo medio

```typescript
interface IndexingSpinner {
  spinner: Ora;
  onProgress: (info: InitialSyncProgress) => void;
}

interface ExtendedProgress extends InitialSyncProgress {
  startTime: number;
}

export function createIndexingSpinner(
  root: string,
  label = "Indexing files...",
): IndexingSpinner {
  const spinner = ora({ text: label }).start();
  let startTime = Date.now();
  
  return {
    spinner,
    onProgress(info) {
      const rel = formatRelativePath(root, info.filePath);
      const suffix = rel ? ` ${rel}` : "";
      const deletedInfo = info.deleted > 0 ? ` • deleted ${info.deleted}` : "";
      const errorsInfo = info.errors > 0 ? ` • errors ${info.errors}` : "";
      
      // Calculate ETA
      let etaInfo = "";
      if (info.processed > 0 && info.total > 0) {
        const elapsed = Date.now() - startTime;
        const avgTimePerFile = elapsed / info.processed;
        const remaining = info.total - info.processed;
        const etaMs = remaining * avgTimePerFile;
        
        if (etaMs > 1000) {
          const etaSec = Math.ceil(etaMs / 1000);
          etaInfo = ` • ETA ${etaSec}s`;
        }
      }
      
      spinner.text = `Indexing files (${info.processed}/${info.total}) • uploaded ${info.uploaded}${deletedInfo}${errorsInfo}${etaInfo}${suffix}`;
    },
  };
}
```

#### 2. Adicionar labels de fase (opcional)

```typescript
// Opcional: adicionar fase ao progress
spinner.text = `[Indexing] (${info.processed}/${info.total}) • uploaded ${info.uploaded}...`;

// Ou usar preflight/indexing phases:
// Phase 1: "Discovering files..."
// Phase 2: "Indexing files (45/120)..."
// Phase 3: "Cleaning up..."
```

### Testes

| ID | Cenario | Esperado |
|----|---------|----------|
| SP01 | Sync com 100 arquivos | ETA exibido apos primeiros arquivos |
| SP02 | Sync com 5 arquivos | ETA pode nao aparecer (muito rapido) |
| SP03 | ETA accuracy | ETA diminui conforme progresso |

---

## Decisao de Implementacao

### Criterios para Implementar

Implementar estas features SOMENTE se:

1. **Syntax Highlighting**:
   - Usuarios solicitarem explicitamente
   - Houver feedback de que plain text e dificil de ler
   - `--content` flag for usada frequentemente

2. **Enhanced Sync Progress**:
   - Usuarios reclamarem de falta de feedback
   - Syncs demorarem mais de 30 segundos regularmente

### Metricas a Monitorar

- Frequencia de uso de `--content` flag
- Tempo medio de sync operations
- Feedback qualitativo de usuarios

---

## Checklist de Conclusao

### Feature 1: Syntax Highlighting
- [ ] Dependencia `cli-highlight` adicionada
- [ ] Flag `--highlight` implementada
- [ ] Deteccao de linguagem funcionando
- [ ] NO_COLOR respeitado
- [ ] Testes passando

### Feature 2: Sync Progress
- [ ] ETA implementado (se decidido)
- [ ] Labels de fase adicionados (se decidido)
- [ ] Testes passando

---

## Notas Adicionais

### Alternativa ao cli-highlight

Se `cli-highlight` for muito pesado, considerar:
- `prism-cli` - mais leve
- Implementacao manual com ANSI codes para linguagens principais

### Impacto de Performance

O highlighting adiciona overhead:
- ~5-10ms por chunk para arquivos pequenos
- Pode ser perceptivel com `--max-count 50`
- Considerar cache se necessario

### Exemplo de Output com Highlighting

```
$ mgrep search "createStore" --content --highlight

./src/lib/context.ts:15-25 (95.50% match)
export async function createStore(): Promise<Store> {
  const config = loadConfig(process.cwd());
  return new QdrantStore(config.qdrant);
}
```

(Com cores: `export` em roxo, `async function` em azul, strings em verde, etc.)
