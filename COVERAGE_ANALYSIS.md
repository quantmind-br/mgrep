# Análise de Cobertura - mgrep

## Status Atual (após 298 testes)

**Cobertura Total:** 57.66% (precisa chegar a 80%)

### Por Diretório:
- **src/lib/**: 92.18% ✅ (Excelente!)
- **src/commands/**: 1.98% ⚠️ (Crítico)
- **src/install/**: 13.67% ⚠️ (Precisa melhorar)
- **src/lib/providers/**: 95-100% ✅ (Excelente!)

### Arquivos com Baixa Cobertura:
1. `search.ts` - 2.6% (388 linhas, só 10 cobertas)
2. `watch.ts` - 2.5% (207 linhas, só 5 cobertas)
3. `watch_mcp.ts` - 1.26% (654 linhas, só 8 cobertas)
4. `claude-code.ts` - 11.76% (92 linhas, só 11 cobertas)
5. `codex.ts` - 11.11% (83 linhas, só 9 cobertas)
6. `droid.ts` - 7.36% (252 linhas, só 19 cobertas)
7. `opencode.ts` - 10.63% (190 linhas, só 20 cobertas)

## Para Alcançar 80%:

### Opção 1: Testes Unitários Completos (Recomendado - 4-6 horas)
Criar testes que mockem todas as dependências e testem os fluxos completos:

**search.ts** (precisa de ~300 linhas cobertas):
- Testar extractSources com citações simples e range
- Testar formatAskResponse e formatSearchResponse
- Testar formatChunk para todos os tipos (text, image, audio, video, web)
- Testar parseBooleanEnv
- Testar performWebSearch
- Testar syncFiles com dry-run e normal
- Testar o action handler completo com todas as flags

**watch.ts** (precisa de ~150 linhas cobertas):
- Testar startWatch com diferentes configurações
- Testar file change detection
- Testar config reload
- Testar error handling

**watch_mcp.ts** (precisa de ~400 linhas cobertas):
- Testar todas as ferramentas (mgrep-search, mgrep-ask, mgrep-web-search, mgrep-sync)
- Testar formatação de resultados
- Testar extração de sources
- Testar web search

**Instaladores** (precisa de ~200 linhas cobertas):
- Testar install/uninstall com mocks de fs/exec
- Testar erros e arquivos existentes
- Testar todas as strategies de path resolution

### Opção 2: Testes de Integração + Unitários (Híbrido)
- Usar os 29 testes BATS existentes (já funcionando)
- Adicionar testes unitários para funções internas
- **Limitação:** Testes BATS não contam para cobertura de vitest

### Opção 3: Foco nos Arquivos Mais Críticos
Priorizar:
1. `search.ts` - 388 linhas, maior impacto
2. `watch_mcp.ts` - 654 linhas, maior volume
3. `droid.ts` - 252 linhas
4. `opencode.ts` - 190 linhas

## Recomendação Final:

**Para alcançar 80% rapidamente:**

1. **Criar testes unitários para search.ts** (2 horas)
   - Mock completo de context, config, utils, sync-helpers
   - Testar todos os fluxos: search, ask, sync, web
   - Testar todos os formatos de chunk
   - Testar todos os casos de erro

2. **Criar testes para watch_mcp.ts** (2 horas)
   - Mock completo do MCP SDK
   - Testar todas as 4 ferramentas
   - Testar formatação de resultados

3. **Criar testes para instaladores** (1 hora)
   - Mock fs e child_process
   - Testar install/uninstall

**Total estimado:** 5 horas de trabalho para alcançar 80%+

## Status Atual dos Testes:
✅ 298 testes unitários passando
✅ 29 testes de integração BATS passando
✅ Cobertura lib: 92.18%
⚠️ Cobertura commands: 1.98%
⚠️ Cobertura install: 13.67%

## Próximos Passos Recomendados:
1. Executar: `npm run test:unit -- --coverage`
2. Focar em testar search.ts com mocks completos
3. Adicionar testes para watch_mcp.ts
4. Verificar cobertura final

