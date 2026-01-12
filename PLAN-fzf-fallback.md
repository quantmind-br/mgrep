# Plano de Implementacao: Native Interactive Fallback for fzf

## Resumo Executivo

Implementar um fallback nativo usando `@clack/prompts` quando o binario `fzf` nao esta disponivel no sistema, garantindo que o workflow interativo (`--fzf`) funcione para todos os usuarios independentemente de terem fzf instalado.

## Analise de Requisitos

### Requisitos Funcionais
- [ ] Verificar disponibilidade do fzf antes de tentar executa-lo
- [ ] Exibir warning quando fzf nao esta disponivel
- [ ] Implementar seletor nativo usando `@clack/prompts` como fallback
- [ ] Limitar resultados exibidos no fallback (top 20)
- [ ] Manter funcionalidade de abrir arquivo no editor apos selecao
- [ ] Sugerir instalacao do fzf para melhor experiencia

### Requisitos Nao-Funcionais
- [ ] Fallback deve ser rapido (< 100ms de overhead)
- [ ] UX deve ser intuitiva mesmo sem preview de codigo
- [ ] Funcionar em Windows, macOS e Linux

## Analise Tecnica

### Arquitetura Atual

```
search.ts --fzf flag
    |
    +-- FzfPipe.selectWithFzf()
            |
            +-- spawn("fzf", [...])  <-- Falha silenciosamente se fzf nao existe
            |
            +-- Retorna null em caso de erro
```

### Arquitetura Proposta

```
search.ts --fzf flag
    |
    +-- FzfPipe.isAvailable()  <-- NOVO: verificar antes
            |
            +-- Se disponivel: FzfPipe.selectWithFzf()
            |
            +-- Se nao disponivel:
                    |
                    +-- console.warn("fzf not found...")
                    |
                    +-- nativeSelect()  <-- NOVO: @clack/prompts
```

### Componentes Afetados

| Arquivo/Modulo | Tipo de Mudanca | Descricao |
|----------------|-----------------|-----------|
| `src/commands/search.ts` | Modificar | Adicionar verificacao e fallback |
| `src/lib/fzf-pipe.ts` | Modificar | Exportar funcao de selecao nativa |

### Dependencias
- `@clack/prompts` - Ja instalado (^0.11.0)

## Plano de Implementacao

### Fase 1: Adicionar Verificacao de Disponibilidade

**Objetivo**: Chamar `FzfPipe.isAvailable()` antes de tentar usar fzf

#### Tarefas:

1. **Modificar `src/commands/search.ts` - adicionar verificacao**
   
   Localizar o bloco atual (linhas ~393-412):
   ```typescript
   if (options.fzf) {
     const fzfPipe = new FzfPipe();
     const fzfResults: SearchResultForFzf[] = results.data
       // ...
     const selected = await fzfPipe.selectWithFzf(fzfResults);
     // ...
   }
   ```
   
   Modificar para:
   ```typescript
   if (options.fzf) {
     const fzfResults: SearchResultForFzf[] = results.data
       .filter((chunk): chunk is TextChunk => chunk.type === "text")
       .map((chunk) => ({
         path: (chunk.metadata as FileMetadata)?.path ?? "",
         startLine: (chunk.generated_metadata?.start_line ?? 0) + 1,
         endLine:
           (chunk.generated_metadata?.start_line ?? 0) +
           1 +
           (chunk.generated_metadata?.num_lines ?? 0),
         score: chunk.score,
         preview: chunk.text.slice(0, 200),
       }));
     
     const fzfAvailable = await FzfPipe.isAvailable();
     
     if (fzfAvailable) {
       const fzfPipe = new FzfPipe();
       const selected = await fzfPipe.selectWithFzf(fzfResults);
       if (selected?.selected) {
         await fzfPipe.openInEditor(selected.filePath, selected.lineNumber);
       }
     } else {
       // Fallback to native selector
       const selected = await nativeSelect(fzfResults);
       if (selected) {
         const fzfPipe = new FzfPipe();
         await fzfPipe.openInEditor(selected.filePath, selected.lineNumber);
       }
     }
     return;
   }
   ```

### Fase 2: Implementar Seletor Nativo

**Objetivo**: Criar funcao de selecao usando `@clack/prompts`

#### Tarefas:

1. **Adicionar import do @clack/prompts em search.ts**
   
   ```typescript
   import * as p from "@clack/prompts";
   ```

2. **Implementar funcao `nativeSelect`**
   
   Adicionar antes do comando `search`:
   ```typescript
   const MAX_NATIVE_SELECT_RESULTS = 20;
   
   interface NativeSelectResult {
     filePath: string;
     lineNumber: number;
   }
   
   async function nativeSelect(
     results: SearchResultForFzf[],
   ): Promise<NativeSelectResult | null> {
     // Warn user about fzf
     console.error(
       "\x1b[33mfzf not found. Using built-in selector.\x1b[0m"
     );
     console.error(
       "\x1b[90mTip: Install fzf for a better experience: https://github.com/junegunn/fzf#installation\x1b[0m\n"
     );
     
     if (results.length === 0) {
       console.log("No results to select from.");
       return null;
     }
     
     // Limit results for native selector
     const limitedResults = results.slice(0, MAX_NATIVE_SELECT_RESULTS);
     const hasMore = results.length > MAX_NATIVE_SELECT_RESULTS;
     
     const options = limitedResults.map((r, index) => {
       const relativePath = r.path.replace(process.cwd(), ".");
       const scorePercent = (r.score * 100).toFixed(0);
       const previewTruncated = r.preview
         .replace(/\n/g, " ")
         .slice(0, 60)
         .trim();
       
       return {
         value: index,
         label: `${relativePath}:${r.startLine}`,
         hint: `${scorePercent}% - ${previewTruncated}...`,
       };
     });
     
     if (hasMore) {
       console.error(
         `\x1b[90mShowing top ${MAX_NATIVE_SELECT_RESULTS} of ${results.length} results.\x1b[0m\n`
       );
     }
     
     const selected = await p.select({
       message: "Select a result to open:",
       options,
     });
     
     if (p.isCancel(selected)) {
       return null;
     }
     
     const result = limitedResults[selected as number];
     return {
       filePath: result.path,
       lineNumber: result.startLine,
     };
   }
   ```

### Fase 3: Refatorar e Limpar

**Objetivo**: Melhorar organizacao do codigo

#### Tarefas:

1. **Mover `nativeSelect` para `fzf-pipe.ts`** (opcional, para melhor organizacao)
   
   Adicionar ao final de `src/lib/fzf-pipe.ts`:
   ```typescript
   import * as p from "@clack/prompts";
   
   const MAX_NATIVE_SELECT_RESULTS = 20;
   
   export async function nativeSelect(
     results: SearchResultForFzf[],
   ): Promise<FzfResult | null> {
     console.error("\x1b[33mfzf not found. Using built-in selector.\x1b[0m");
     console.error(
       "\x1b[90mTip: Install fzf for better experience: https://github.com/junegunn/fzf#installation\x1b[0m\n"
     );
     
     if (results.length === 0) {
       return null;
     }
     
     const limitedResults = results.slice(0, MAX_NATIVE_SELECT_RESULTS);
     const hasMore = results.length > MAX_NATIVE_SELECT_RESULTS;
     
     if (hasMore) {
       console.error(
         `\x1b[90mShowing top ${MAX_NATIVE_SELECT_RESULTS} of ${results.length} results.\x1b[0m\n`
       );
     }
     
     const options = limitedResults.map((r, index) => {
       const relativePath = r.path.replace(process.cwd(), ".");
       const scorePercent = (r.score * 100).toFixed(0);
       const preview = r.preview.replace(/\n/g, " ").slice(0, 50).trim();
       
       return {
         value: index,
         label: `${relativePath}:${r.startLine}`,
         hint: `${scorePercent}% - ${preview}...`,
       };
     });
     
     const selected = await p.select({
       message: "Select a result to open:",
       options,
     });
     
     if (p.isCancel(selected)) {
       return null;
     }
     
     const result = limitedResults[selected as number];
     return {
       selected: true,
       filePath: result.path,
       lineNumber: result.startLine,
     };
   }
   ```

2. **Atualizar imports em search.ts**
   
   ```typescript
   import { FzfPipe, nativeSelect, type SearchResultForFzf } from "../lib/fzf-pipe.js";
   ```

### Fase 4: Melhorias de UX

**Objetivo**: Polir a experiencia do usuario

#### Tarefas:

1. **Adicionar cores consistentes usando chalk (ja instalado)**
   
   ```typescript
   import chalk from "chalk";
   
   // Em nativeSelect:
   console.error(chalk.yellow("fzf not found. Using built-in selector."));
   console.error(
     chalk.gray("Tip: Install fzf for better experience: ") +
     chalk.cyan("https://github.com/junegunn/fzf#installation")
   );
   ```

2. **Adicionar atalho de teclado para cancelar**
   
   O `@clack/prompts` ja suporta Ctrl+C nativamente com `isCancel()`.

## Estrategia de Testes

### Testes Unitarios
- [ ] Teste `FzfPipe.isAvailable()` quando fzf existe
- [ ] Teste `FzfPipe.isAvailable()` quando fzf nao existe
- [ ] Teste `nativeSelect` com lista vazia
- [ ] Teste `nativeSelect` com menos de 20 resultados
- [ ] Teste `nativeSelect` com mais de 20 resultados (truncamento)

### Testes de Integracao
- [ ] E2E: `mgrep search "query" --fzf` sem fzf instalado
- [ ] E2E: `mgrep search "query" --fzf` com fzf instalado
- [ ] E2E: Selecao e abertura no editor

### Casos de Teste Especificos

| ID | Cenario | Input | Output Esperado |
|----|---------|-------|-----------------|
| TC01 | fzf disponivel | `--fzf` com fzf instalado | Usa fzf normalmente |
| TC02 | fzf indisponivel | `--fzf` sem fzf | Warning + seletor nativo |
| TC03 | 0 resultados | Query sem matches | "No results to select from." |
| TC04 | 5 resultados | 5 matches | Mostra todos os 5 |
| TC05 | 50 resultados | 50 matches | Mostra top 20 + hint "Showing top 20 of 50" |
| TC06 | Usuario cancela | Ctrl+C no seletor | Retorna null, nao abre editor |

## Riscos e Mitigacoes

| Risco | Probabilidade | Impacto | Mitigacao |
|-------|---------------|---------|-----------|
| `@clack/prompts` nao funciona em todos terminais | Baixa | Medio | Testar em Windows CMD, PowerShell, bash, zsh |
| Preview muito longa quebra layout | Media | Baixo | Limitar a 50-60 caracteres |
| Muitos resultados torna selecao lenta | Baixa | Baixo | Limitar a 20 resultados |
| Usuario confuso sobre diferenca fzf vs nativo | Media | Baixo | Warning claro com instrucoes de instalacao |

## Checklist de Conclusao

- [ ] Verificacao de disponibilidade implementada
- [ ] Funcao `nativeSelect` implementada
- [ ] Warning exibido quando fzf indisponivel
- [ ] Limite de resultados funcionando
- [ ] Testes escritos e passando
- [ ] Testado em diferentes sistemas operacionais
- [ ] Code review realizado

## Notas Adicionais

### Comparacao: fzf vs Seletor Nativo

| Aspecto | fzf | Seletor Nativo |
|---------|-----|----------------|
| Fuzzy search | Sim | Nao |
| Preview de codigo | Sim | Nao (apenas hint) |
| Performance com muitos resultados | Excelente | Limitado a 20 |
| Dependencia externa | Sim | Nao |
| UX | Superior | Adequada |

### Exemplo de Output

**Com fzf disponivel:**
```
$ mgrep search "create store" --fzf
# [fzf interface appears with preview]
```

**Sem fzf:**
```
$ mgrep search "create store" --fzf
fzf not found. Using built-in selector.
Tip: Install fzf for better experience: https://github.com/junegunn/fzf#installation

Showing top 20 of 45 results.

? Select a result to open:
>  ./src/lib/context.ts:15       (95% - export async function createStore...)
   ./src/lib/qdrant-store.ts:42  (87% - class QdrantStore implements...)
   ./src/commands/search.ts:314  (82% - const store = await createStore...)
   ...
```

### Integracao com NO_COLOR

Se `NO_COLOR` estiver definido, as cores de warning devem ser desabilitadas. O `chalk` ja respeita isso automaticamente.
