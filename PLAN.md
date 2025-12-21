# PLAN

## 0. Analise das sugestoes (relevancia)

- 1.1 Command injection no OpenCode: **relevante**. Embora `Bun.$` escape interpolacoes, queries como `--help` ou flags maliciosas podem causar comportamento inesperado. Ajuste necessario: validar entrada, evitar query interpretada como flag, e montar args de forma explicita.
- 1.2 mgrep_watch.py (processo e PID): **relevante**. PID file nao valida processo, cwd e ignorado, falta cleanup em falhas, e ha race conditions potenciais.
- 1.3 watch_mcp timeout: nao pertinente. O codigo ja usa 5s e o log esta correto.
- 1.4 Qdrant port workaround: nao pertinente. O workaround ja esta implementado.
- 2.1 Logs (console vs winston): baixa relevancia para MCP (redireciona stdout para stderr). Porem, `watch.ts` deveria usar winston consistentemente.
- 2.2 Cache de configuracao: **relevante** para processos long-running (watch e mcp). Requer tratamento de config invalida.
- 2.3 Otimizacao de initialSync: **relevante**, mas requer incluir size/mtime no metadata e plano de migracao.
- 3.1 SKILL inconsistente entre plugins: **relevante**; precisa centralizar, alinhar capacidades e versionar.
- 4.1 Registro dinamico de provedores: nao pertinente agora; custo alto e baixo ganho.

---

## 1. Harden do plugin OpenCode (ajuste do item 1.1)

**Dependencia**: Secao 5 deve ser concluida antes (SKILL canonico).

1.1 Confirmar (documentar no codigo) que o risco nao e injection, mas sim parse de flags na query.

1.2 Adicionar validacao de entrada em `src/install/opencode.ts`:
- Rejeitar queries vazias ou apenas whitespace.
- Limitar tamanho maximo da query (ex: 10KB) para prevenir DoS.
- Sanitizar caracteres de controle.

1.3 Atualizar `src/install/opencode.ts`:
- Carregar SKILL canonico via helper (ver Secao 5).
- Trocar execucao para `Bun.spawn` com args construidos (sem shell).
- Incluir `--` antes da query para evitar interpretacao como flags.
- Mapear flags canonicas: `--max-count` (ou `-m`), `--answer` (ou `-a`), `--web`, `--content`, `--no-rerank`, `[path]` opcional.

1.4 Tratamento de erros:
- Se `Bun.spawn` falhar (exit code != 0), retornar stderr com prefixo `[ERROR]`.
- Se timeout ocorrer, retornar mensagem clara de timeout.
- Logar erros via winston (nao console).

1.5 Garantir que o retorno em sucesso continua sendo `stdout` text/plain com `trim()`.

---

## 2. Robustez dos hooks do watch (item 1.2)

### 2.1 `plugins/mgrep/hooks/mgrep_watch.py`:

**Validacao de entrada:**
- Validar payload (None ou sem session_id) e sair com log claro.
- Usar `cwd` do payload se existir e for diretorio; fallback para `os.getcwd()`.

**Prevencao de race condition (PID file):**
- Usar criacao atomica com `os.open(..., os.O_CREAT | os.O_EXCL | os.O_WRONLY)`.
- Alternativa: usar `fcntl.flock()` para file locking.
- Se PID file existir:
  - Ler PID; se parse falhar -> remover e continuar.
  - Se processo nao existir (via `os.kill(pid, 0)`) -> remover e continuar.
  - Se processo existir -> logar e sair.

**Cleanup robusto:**
- Envolver `Popen` e escrita do PID em try/except.
- Se falhar apos criar PID file, remover arquivo antes de sair.
- Usar `atexit.register()` para cleanup em caso de crash do hook.
- Usar `with open(..., "w")` para stdout/stderr e fechar descritores no pai.

### 2.2 `plugins/mgrep/hooks/mgrep_watch_kill.py`:

- Validar payload e session_id.
- Se PID file nao existir -> log e sair 0 (idempotente).
- Se PID file existir e processo nao rodar -> remover arquivo e sair 0.
- Sequencia de terminacao:
  1. Enviar SIGTERM.
  2. Aguardar **3 segundos** (timeout explicito).
  3. Se processo ainda existir, enviar SIGKILL.
  4. Tratar `ProcessLookupError` e `PermissionError` graciosamente.
- Remover PID file apos confirmacao de terminacao.

### 2.3 Logging:
- Adicionar logs curtos para facilitar debug (nivel INFO).
- Formato: `[mgrep_watch] <acao>: <detalhes>`.

### 2.4 (Futuro) Considerar migracao para `systemd` user units para processos long-running, eliminando gerenciamento manual de PIDs.

---

## 3. Recarregar configuracao sem reiniciar (item 2.2)

### 3.1 `src/lib/config.ts`:
- Adicionar opcao `loadConfig(..., { reload?: boolean })` ou nova funcao `loadConfigFresh`.
- Exportar helper `getConfigPaths(dir)` para candidatos local + global.
- Exportar `clearConfigCache()` para invalidar cache.

### 3.2 `src/commands/watch.ts`:
- Manter `let currentConfig = loadConfig(...)`.
- Iniciar watchers para arquivos em `getConfigPaths(watchRoot)`.
- Usar `chokidar` com opcao `awaitWriteFinish: { stabilityThreshold: 500 }` para lidar com saves atomicos de editores.
- Ao detectar change/rename:
  1. `clearConfigCache()`.
  2. Tentar recarregar config.
  3. Se sucesso, atualizar `currentConfig`.
  4. Se falha, **manter config anterior** e logar erro (nao crashar).
- No handler de eventos, usar `currentConfig` atual para `uploadFile`.

### 3.3 `src/commands/watch_mcp.ts`:
- Inicializar `let currentConfig = loadConfig(root)` e reusar em `performWebSearch` e `mgrep-sync`.
- Adicionar watchers iguais aos do watch para atualizar `currentConfig`.
- Manter logs em stderr (comportamento MCP).
- Mesmo tratamento de erro: manter config anterior se nova for invalida.

### 3.4 Debounce:
- Usar debounce de **500ms** (minimo) para evitar reload em cascata.
- Considerar 1000ms se editores causarem multiplos eventos.

### 3.5 Tratamento de config invalida:
- Capturar erros de Zod validation.
- Logar erro detalhado com linha/coluna se possivel.
- Emitir log de WARNING: "Config reload failed, keeping previous configuration".
- **Nunca** crashar o processo por config invalida.

### 3.6 Testes:
- Adicionar teste para `loadConfig` com reload.
- Adicionar teste para config invalida (deve manter anterior).
- Ajustar test.bats para simular mudanca de config.

---

## 4. Otimizacao do initialSync (item 2.3)

### 4.1 Tipos e metadata:
- Estender `FileMetadata` em `src/lib/store.ts` com `size?: number` e `mtimeMs?: number`.
- Atualizar `UploadFileOptions` e `StoreFile` para refletir novos campos.
- **NOTA**: Estes sao campos opcionais para manter backwards compatibility.

### 4.2 Qdrant:
- Estender `QdrantPayload` para incluir `size` e `mtimeMs`.
- Em `uploadFile`, propagar `options.metadata.size/mtimeMs`.
- Em `listFiles`, retornar `metadata` com size/mtimeMs quando presentes.

### 4.3 TestStore:
- Persistir size/mtimeMs nos dados locais.
- Garantir que `listFiles` devolve esses campos.

### 4.4 `src/lib/utils.ts`:
- Criar nova funcao `listStoreFileMetadata()` retornando `{ hash, size?, mtimeMs? }`.
- **Manter** `listStoreFileHashes()` como wrapper deprecated para backwards compatibility:
  ```typescript
  /** @deprecated Use listStoreFileMetadata instead */
  export function listStoreFileHashes(...) {
    return listStoreFileMetadata(...).then(m => new Map([...m].map(([k, v]) => [k, v.hash])));
  }
  ```
- No loop de `initialSync`:
  1. Fazer `stat` antes de `readFile`.
  2. Se metadata tem hash + size + mtimeMs e ambos batem com o stat atual, pular leitura e upload.
  3. Se size/mtime nao batem ou nao existem, ler arquivo e comparar hash como hoje.
  4. Manter contadores/progressos consistentes em todos os caminhos.
- Ajustar `uploadFile` para aceitar `stat` opcional e evitar duplo `stat`.

### 4.5 Trade-off documentado:
- **IMPORTANTE**: Comparacao size+mtime e heuristica, nao garantia.
- Cenario raro: `touch` sem modificar conteudo resulta em mtime diferente mas hash igual.
- Decisao: Aceitar trade-off em favor de performance. Documentar no codigo.

### 4.6 Migracao de dados existentes:
- Arquivos indexados antes desta mudanca nao terao size/mtimeMs.
- Na primeira sync apos upgrade:
  - Detectar ausencia de size/mtimeMs no metadata.
  - Forcar re-upload desses arquivos para popular novos campos.
  - Logar: "Migrating X files to new metadata format".
- Alternativa: Rodar `mgrep sync --force` uma vez apos upgrade.

### 4.7 Logs:
- Atualizar logs de dry-run para reportar arquivos ignorados por metadata match.
- Formato: `[skip] path/to/file (metadata match)`.

### 4.8 Testes:
- Cobrir caso de metadata ausente (fallback para hash).
- Cobrir caso de metadata match (skip).
- Cobrir caso de metadata mismatch (re-upload).
- Cobrir migracao de dados antigos.

---

## 5. Unificacao de SKILL e alinhamento de capacidades (item 3.1)

**IMPORTANTE**: Esta secao deve ser concluida ANTES da Secao 1.

### 5.1 Fonte unica:
- Definir `plugins/mgrep/skills/mgrep/SKILL.md` como fonte unica de verdade.
- Todas as instalacoes devem ler deste arquivo.

### 5.2 Criar helper `src/install/skill.ts`:
- Resolver caminho para SKILL.md.
- Estrategia de resolucao (em ordem):
  1. `import.meta.url` + path relativo (desenvolvimento).
  2. `__dirname` + path relativo (fallback para CommonJS).
  3. Buscar em `dist/plugins/mgrep/skills/mgrep/SKILL.md` (bundle).
- Retornar conteudo como string.
- Fallback com erro claro se arquivo nao existir.
- Exportar funcao `getSkillVersion()` que retorna hash SHA256 do conteudo (para deteccao de mudancas).

### 5.3 `src/install/codex.ts`:
- Substituir string inline por `loadSkill()`.
- Manter logica de append/replace.
- Armazenar versao do SKILL instalado para detectar quando reinstalar.

### 5.4 `src/install/opencode.ts`:
- Substituir SKILL inline no `TOOL_DEFINITION` pelo conteudo do helper.
- Atualizar args e comando para suportar opcoes canonicas:
  - `--web` - busca web
  - `--answer` ou `-a` - modo RAG
  - `--content` - incluir conteudo
  - `--max-count N` ou `-m N` - limitar resultados
  - `--no-rerank` - desabilitar rerank
  - `[path]` - escopo opcional
- Garantir que descricao e exemplos correspondem ao comportamento real.

### 5.5 Revisar SKILL.md:
- Garantir flags e exemplos corretos.
- Alinhar nomenclatura entre short flags (-m, -a) e long flags (--max-count, --answer).
- Documentar todos os exemplos de uso.

### 5.6 Build:
- Verificar que `dist/plugins` continua sendo copiado no build (script `postbuild`).
- Adicionar teste para verificar que SKILL.md existe em dist.

### 5.7 Versionamento:
- Armazenar hash do SKILL em arquivo de instalacao.
- Na proxima execucao, comparar hash para detectar atualizacoes.
- Se hash diferir, sugerir ou executar reinstalacao automatica.

---

## 6. Validacao final

### 6.1 Linting e testes automatizados:
- Rodar `npm run lint` - zero erros.
- Rodar `npm run test` - todos os testes passando.

### 6.2 Testes automatizados adicionais (Bats):
- Config reload: mock de mudanca de arquivo, verificar que nova config e aplicada.
- Config invalida: verificar que config anterior e mantida.
- Hook lifecycle: start -> verificar PID file -> kill -> verificar cleanup.
- SKILL loading: arquivo existe vs arquivo ausente.
- Migracao de metadata: arquivos antigos sao re-uploadados.

### 6.3 Verificacao de backwards compatibility:
- Verificar que tipos exportados nao quebraram:
  - `FileMetadata` - campos novos sao opcionais.
  - `UploadFileOptions` - campos novos sao opcionais.
  - `listStoreFileHashes` - ainda funciona (deprecated).
- Testar com colecao Qdrant existente (sem novos campos).

### 6.4 Teste manual:
- `mgrep mcp` inicia sem logs no stdout.
- `mgrep watch` reage a mudanca de config (maxFileSize/concurrency).
- `mgrep watch` mantem config anterior se nova for invalida.
- Hooks do plugin: iniciar e finalizar sessao e verificar limpeza de PID/processo.
- OpenCode tool executa `mgrep search` com novas flags.
- Verificar que `--` previne interpretacao de query como flag.

### 6.5 Documentacao:
- Atualizar README.md se comportamento externo mudar.
- Atualizar CHANGELOG.md com todas as mudancas.
- Documentar breaking changes (se houver).

---

## 7. Ordem de execucao recomendada

As secoes tem dependencias. Ordem sugerida:

1. **Secao 5** (SKILL) - base para outras secoes.
2. **Secao 1** (OpenCode harden) - depende de Secao 5.
3. **Secao 2** (Hooks) - independente, pode ser paralela com 1.
4. **Secao 3** (Config reload) - independente.
5. **Secao 4** (initialSync) - independente, mas mais complexa.
6. **Secao 6** (Validacao) - apos todas as outras.

Secoes 2, 3 e 4 podem ser desenvolvidas em paralelo se houver multiplos desenvolvedores.

---

## 8. Rollback plan

Em caso de problemas em producao:

### 8.1 Problemas com config reload (Secao 3):
- Reverter para versao anterior do `watch.ts` / `watch_mcp.ts`.
- Config reload e feature nova, nao afeta funcionalidade existente.

### 8.2 Problemas com metadata/initialSync (Secao 4):
- Rodar `mgrep sync --force` para reindexar tudo.
- Se necessario, dropar colecao Qdrant e recriar.

### 8.3 Problemas com hooks (Secao 2):
- Matar processos manualmente: `pkill -f "mgrep watch"`.
- Remover PID files orfaos: `rm ~/.local/state/mgrep/*.pid`.

### 8.4 Problemas com SKILL/OpenCode (Secoes 1 e 5):
- Reinstalar plugin: `mgrep install opencode --force`.
- SKILL e texto, nao afeta runtime do mgrep.
