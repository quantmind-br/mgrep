O seu plano em **PLAN.md** é excelente e demonstra uma compreensão profunda das lacunas entre a implementação atual e o potencial do protocolo MCP. Você identificou corretamente que o "esqueleto" mencionado no README já foi superado pelo código, mas ainda carece de ferramentas de utilidade e introspeção de arquivos.

Abaixo, apresento uma revisão detalhada com sugestões de melhorias técnicas, correções de segurança e refinamentos de UX para o plano.

-----

## 1\. Sugestões de Melhorias Técnicas

### A. Refinamento da Ferramenta `mgrep-get-file`

No seu pseudocódigo, você lê o arquivo diretamente do FS. Isso é ótimo para "dados frescos", mas pode causar inconsistência se o arquivo no disco divergir drasticamente do que está no índice do Qdrant (o que o agente "pensa" que existe).

  * **Sugestão:** Adicione um campo opcional `sync_first: boolean` (default: false). Se `true`, executa uma sincronização rápida apenas desse arquivo antes da leitura para garantir que o Store e o Disco estejam alinhados.

### B. Otimização de `mgrep-list-files`

Listar todos os arquivos de um repositório grande pode estourar o limite de tokens do MCP/LLM.

  * **Melhoria:** No plano, adicione um filtro por **extensão** (ex: `.ts`, `.md`). Agentes frequentemente querem listar apenas arquivos de código, ignorando assets ou configurações.
  * **Atenção ao Store:** Verifique se o `TestStore` (usado em testes) suporta `listFiles` com a mesma semântica que o `QdrantStore`.

### C. Contexto Inteligente em `mgrep-get-context`

Apenas retornar linhas fixas (20 antes/depois) é útil, mas pode cortar funções no meio.

  * **Sugestão Avançada:** Se o arquivo for `.ts` ou `.js`, o agente se beneficiaria de saber em qual *escopo* (classe/função) aquela linha está. Embora complexo para agora, considere adicionar um campo `include_function_signature: boolean` que tenta localizar a declaração da função pai.

-----

## 2\. Correções e Segurança (Crucial)

### A. Prevenção de Path Traversal

No pseudocódigo de `mgrep-get-file`, a lógica de sanitização precisa ser mais rigorosa.

  * **Correção:** Não basta checar `startsWith(root)`. É necessário usar `path.resolve` e verificar o `realpath` para evitar bypass com links simbólicos que apontam para fora do diretório do projeto.

### B. Limites de Payload (Tokens)

O MCP tem limites implícitos de transporte de mensagens.

  * **Sugestão:** Adicione uma verificação de tamanho de arquivo em `mgrep-get-file`. Se o arquivo for maior que 50KB ou 1000 linhas, a ferramenta deve retornar um erro sugerindo que o agente use `start_line` e `end_line` para ler em pedaços.

-----

## 3\. Melhoria na Estrutura do PLAN.md

O plano está muito bem estruturado. Para torná-lo ainda mais "acionável", sugiro adicionar uma seção de **Arquitetura de Fluxo** para mostrar como as novas ferramentas se encaixam no ciclo de vida do Agente.

-----

## 4\. Revisão dos Arquivos de Documentação (Updates)

No seu plano para atualizar o `README.md` e `CLAUDE.md`:

  * **Configuração do Claude Desktop:** No exemplo de JSON, o `command` para rodar via `npx` pode ser lento ou falhar se o pacote não estiver publicado. Sugira também o caminho direto:
    ```json
    "command": "node",
    "args": ["/absolute/path/to/mgrep/dist/src/index.js", "mcp"]
    ```
  * **Status de Beta:** Adicione uma nota de que as ferramentas de escrita (se vierem a existir) são desabilitadas por padrão, mantendo o MCP como *read-only* por segurança.

-----

## Próximo Passo Recomendado

O plano está pronto para execução. Gostaria que eu **escrevesse a implementação completa da ferramenta `mgrep-get-file`** em TypeScript, já aplicando as proteções de path traversal e os filtros de linha mencionados?