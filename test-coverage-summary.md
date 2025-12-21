# Cobertura de Testes - mgrep

## Status Atual
- **Cobertura Total:** 57.66%
- **Meta:** 80%
- **Falta:** 22.34%

## Testes Existentes
- **Unitários:** 295 testes passando
- **Integração (BATS):** 29 testes passando

## Arquivos com Alta Cobertura (>90%)
✅ src/lib/context.ts - 100%
✅ src/lib/sync-helpers.ts - 100%
✅ src/lib/providers/web/ - 100%
✅ src/lib/providers/llm/ - 98.5%
✅ src/lib/file.ts - 95.71%
✅ src/lib/git.ts - 96.87%
✅ src/lib/logger.ts - 97.43%
✅ src/lib/utils.ts - 96.96%
✅ src/lib/store.ts - 88.09%
✅ src/lib/qdrant-store.ts - 88.8%
✅ src/lib/config.ts - 88.48%

## Arquivos com Baixa Cobertura
⚠️ src/commands/search.ts - 2.6% (31-388 linhas não cobertas)
⚠️ src/commands/watch.ts - 2.5% (19-207 linhas não cobertas)
⚠️ src/commands/watch_mcp.ts - 1.26% (37-654 linhas não cobertas)
⚠️ src/install/claude-code.ts - 11.76% (6-92 linhas não cobertas)
⚠️ src/install/codex.ts - 11.11% (10-83 linhas não cobertas)
⚠️ src/install/droid.ts - 7.36% (7-252 linhas não cobertas)
⚠️ src/install/opencode.ts - 10.63% (7-190 linhas não cobertas)
⚠️ src/install/skill.ts - 54.54% (29-46 linhas não cobertas)
⚠️ src/lib/providers/index.ts - 0%
⚠️ src/lib/providers/types.ts - 0%

## Estratégia para Alcançar 80%

### Opção 1: Testes Unitários Detalhados (Recomendado)
Criar testes unitários completos para os arquivos de comandos e instaladores:
- Mock de todas as dependências (fs, child_process, etc.)
- Testar todos os fluxos principais
- Testar casos de erro e edge cases
- **Estimativa:** 4-6 horas de trabalho

### Opção 2: Testes de Integração
Executar os comandos reais com testes BATS:
- Já temos 29 testes BATS funcionando
- Adicionar mais testes para cobrir casos faltantes
- **Limitação:** Não aumenta cobertura de linhas no relatório

### Opção 3: Híbrido
- Testes unitários para lógica complexa
- Testes de integração para fluxos completos
- **Mais equilibrado**

## Recomendação

Focar em testes unitários para:
1. `src/commands/search.ts` - Testar search, ask, sync, web
2. `src/commands/watch.ts` - Testar watch, file changes, config reload
3. `src/install/` - Testar cada instalador com mocks de fs/exec

Com testes unitários adequados, podemos facilmente alcançar 80%+.
