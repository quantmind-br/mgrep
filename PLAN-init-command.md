# Plano de Implementacao: Native CLI Init Command

## Resumo Executivo

Implementar um comando `mgrep init` nativo em TypeScript que substitui o workflow baseado em Makefile (`make init-config`), oferecendo uma experiencia de configuracao interativa e cross-platform usando `@clack/prompts`.

## Analise de Requisitos

### Requisitos Funcionais
- [ ] Comando `mgrep init` disponivel via CLI
- [ ] Selecao interativa de provider (OpenAI, Google, Anthropic, Ollama)
- [ ] Configuracao de modelos de embedding e LLM baseado no provider
- [ ] Input de API keys com validacao basica de formato
- [ ] Configuracao opcional de URL do Qdrant
- [ ] Geracao de arquivo `~/.config/mgrep/config.yaml`
- [ ] Flag `--reconfigure` para sobrescrever configuracao existente
- [ ] Deteccao de configuracao existente com prompt de confirmacao

### Requisitos Nao-Funcionais
- [ ] Funcionar em Windows, macOS e Linux
- [ ] Nao depender de ferramentas shell externas
- [ ] Experiencia visual consistente com outras CLIs modernas
- [ ] Feedback claro em caso de erros de validacao

## Analise Tecnica

### Arquitetura Proposta

```
src/commands/init.ts
    |
    +-- @clack/prompts (UI interativa)
    |
    +-- src/lib/config.ts (schema e validacao)
    |
    +-- node:fs + YAML (geracao de arquivo)
```

### Componentes Afetados

| Arquivo/Modulo | Tipo de Mudanca | Descricao |
|----------------|-----------------|-----------|
| `src/commands/init.ts` | Criar | Novo comando de inicializacao |
| `src/index.ts` | Modificar | Registrar comando init |
| `Makefile` | Modificar (opcional) | Atualizar para chamar `mgrep init` |

### Dependencias
- `@clack/prompts` - Ja instalado (^0.11.0), nao utilizado
- `yaml` - Ja instalado (^2.8.2)
- `zod` - Ja instalado (^3.23.8)

## Plano de Implementacao

### Fase 1: Estrutura Base do Comando

**Objetivo**: Criar o esqueleto do comando com UI basica

#### Tarefas:

1. **Criar arquivo `src/commands/init.ts`**
   - Arquivos envolvidos: `src/commands/init.ts`
   
   ```typescript
   import * as fs from "node:fs";
   import * as os from "node:os";
   import * as path from "node:path";
   import * as p from "@clack/prompts";
   import { Command } from "commander";
   import YAML from "yaml";
   
   const CONFIG_DIR = path.join(os.homedir(), ".config", "mgrep");
   const CONFIG_FILE = path.join(CONFIG_DIR, "config.yaml");
   
   export const initCommand = new Command("init")
     .description("Initialize mgrep configuration interactively")
     .option("--reconfigure", "Overwrite existing configuration", false)
     .action(async (options) => {
       // Implementation here
     });
   ```

2. **Registrar comando em `src/index.ts`**
   - Arquivos envolvidos: `src/index.ts`
   
   ```typescript
   import { initCommand } from "./commands/init.js";
   // ...
   program.addCommand(initCommand);
   ```

### Fase 2: Fluxo de Selecao de Provider

**Objetivo**: Implementar selecao interativa de provider com configuracoes associadas

#### Tarefas:

1. **Implementar intro e selecao de provider**
   
   ```typescript
   p.intro("mgrep configuration wizard");
   
   // Check existing config
   if (fs.existsSync(CONFIG_FILE) && !options.reconfigure) {
     const overwrite = await p.confirm({
       message: "Configuration already exists. Overwrite?",
       initialValue: false,
     });
     if (p.isCancel(overwrite) || !overwrite) {
       p.cancel("Configuration cancelled.");
       process.exit(0);
     }
   }
   
   const provider = await p.select({
     message: "Select your LLM provider:",
     options: [
       { value: "openai", label: "OpenAI", hint: "GPT-4, text-embedding-3" },
       { value: "google", label: "Google", hint: "Gemini models" },
       { value: "anthropic", label: "Anthropic", hint: "Claude models" },
       { value: "ollama", label: "Ollama", hint: "Local models" },
     ],
   });
   
   if (p.isCancel(provider)) {
     p.cancel("Configuration cancelled.");
     process.exit(0);
   }
   ```

2. **Definir mapeamento de modelos por provider**
   
   ```typescript
   interface ProviderDefaults {
     embeddingModel: string;
     embeddingProvider: string;
     llmModel: string;
     requiresApiKey: boolean;
     apiKeyEnvVar: string;
   }
   
   const PROVIDER_DEFAULTS: Record<string, ProviderDefaults> = {
     openai: {
       embeddingModel: "text-embedding-3-small",
       embeddingProvider: "openai",
       llmModel: "gpt-4o-mini",
       requiresApiKey: true,
       apiKeyEnvVar: "OPENAI_API_KEY",
     },
     google: {
       embeddingModel: "gemini-embedding-001",
       embeddingProvider: "google",
       llmModel: "gemini-2.0-flash",
       requiresApiKey: true,
       apiKeyEnvVar: "GOOGLE_API_KEY",
     },
     anthropic: {
       embeddingModel: "text-embedding-3-small",
       embeddingProvider: "openai", // Anthropic uses OpenAI for embeddings
       llmModel: "claude-sonnet-4-20250514",
       requiresApiKey: true,
       apiKeyEnvVar: "ANTHROPIC_API_KEY",
     },
     ollama: {
       embeddingModel: "nomic-embed-text",
       embeddingProvider: "ollama",
       llmModel: "llama3.2",
       requiresApiKey: false,
       apiKeyEnvVar: "",
     },
   };
   ```

### Fase 3: Coleta de API Keys e URLs

**Objetivo**: Coletar credenciais com validacao

#### Tarefas:

1. **Implementar coleta de API key (quando necessario)**
   
   ```typescript
   const defaults = PROVIDER_DEFAULTS[provider as string];
   
   let needsOpenAiKey = false;
   if (defaults.requiresApiKey) {
     // For Anthropic, also need OpenAI key for embeddings
     if (provider === "anthropic") {
       p.note(
         "Anthropic doesn't provide embeddings.\n" +
         "OpenAI will be used for embeddings.",
         "Note"
       );
       needsOpenAiKey = true;
     }
   }
   
   // Ollama-specific: ask for base URL
   let ollamaBaseUrl = "http://localhost:11434/v1";
   if (provider === "ollama") {
     const customUrl = await p.text({
       message: "Ollama base URL:",
       placeholder: ollamaBaseUrl,
       defaultValue: ollamaBaseUrl,
     });
     if (!p.isCancel(customUrl)) {
       ollamaBaseUrl = customUrl;
     }
   }
   ```

2. **Validar formato de API key (basico)**
   
   ```typescript
   function validateApiKeyFormat(key: string, provider: string): boolean {
     if (!key || key.trim() === "") return false;
     
     switch (provider) {
       case "openai":
         return key.startsWith("sk-");
       case "anthropic":
         return key.startsWith("sk-ant-");
       default:
         return key.length > 10;
     }
   }
   ```

### Fase 4: Geracao do Arquivo de Configuracao

**Objetivo**: Gerar arquivo YAML valido

#### Tarefas:

1. **Construir objeto de configuracao**
   
   ```typescript
   interface GeneratedConfig {
     qdrant: {
       url: string;
       collectionPrefix: string;
     };
     embeddings: {
       provider: string;
       model: string;
       baseUrl?: string;
       batchSize: number;
       timeoutMs: number;
       maxRetries: number;
     };
     llm: {
       provider: string;
       model: string;
       baseUrl?: string;
       temperature: number;
       maxTokens: number;
       timeoutMs: number;
       maxRetries: number;
     };
     sync: {
       concurrency: number;
     };
     maxFileSize: number;
   }
   
   function buildConfig(provider: string, ollamaUrl?: string): GeneratedConfig {
     const defaults = PROVIDER_DEFAULTS[provider];
     
     const config: GeneratedConfig = {
       qdrant: {
         url: "http://localhost:6333",
         collectionPrefix: "mgrep_",
       },
       embeddings: {
         provider: defaults.embeddingProvider,
         model: defaults.embeddingModel,
         batchSize: 100,
         timeoutMs: 30000,
         maxRetries: 3,
       },
       llm: {
         provider: provider,
         model: defaults.llmModel,
         temperature: 0.7,
         maxTokens: 4096,
         timeoutMs: 60000,
         maxRetries: 3,
       },
       sync: {
         concurrency: 20,
       },
       maxFileSize: 10485760,
     };
     
     if (provider === "ollama" && ollamaUrl) {
       config.embeddings.baseUrl = ollamaUrl;
       config.llm.baseUrl = ollamaUrl;
     }
     
     return config;
   }
   ```

2. **Escrever arquivo YAML**
   
   ```typescript
   function writeConfigFile(config: GeneratedConfig): void {
     // Ensure directory exists
     if (!fs.existsSync(CONFIG_DIR)) {
       fs.mkdirSync(CONFIG_DIR, { recursive: true });
     }
     
     const header = "# mgrep configuration - generated by mgrep init\n\n";
     const yamlContent = YAML.stringify(config);
     
     fs.writeFileSync(CONFIG_FILE, header + yamlContent, "utf-8");
   }
   ```

### Fase 5: Finalizacao e Instrucoes

**Objetivo**: Mostrar proximos passos ao usuario

#### Tarefas:

1. **Exibir resumo e instrucoes de API keys**
   
   ```typescript
   p.note(
     `Configuration saved to ${CONFIG_FILE}`,
     "Success"
   );
   
   const defaults = PROVIDER_DEFAULTS[provider as string];
   
   if (defaults.requiresApiKey) {
     const instructions: string[] = [];
     
     if (provider === "anthropic") {
       instructions.push(`export OPENAI_API_KEY=sk-...  # for embeddings`);
       instructions.push(`export ANTHROPIC_API_KEY=sk-ant-...`);
     } else {
       instructions.push(`export ${defaults.apiKeyEnvVar}=...`);
     }
     
     p.note(
       "Set these environment variables:\n\n" +
       instructions.join("\n"),
       "Required API Keys"
     );
   } else {
     p.note(
       "No API key needed for local Ollama.",
       "API Keys"
     );
   }
   
   p.note(
     "Start Qdrant: make qdrant-start\n" +
     "Then sync files: mgrep sync",
     "Next Steps"
   );
   
   p.outro("Configuration complete!");
   ```

## Estrategia de Testes

### Testes Unitarios
- [ ] Teste de validacao de formato de API key
- [ ] Teste de construcao de config object
- [ ] Teste de mapeamento de providers

### Testes de Integracao
- [ ] Teste de criacao de diretorio de config
- [ ] Teste de escrita de arquivo YAML
- [ ] Teste de parsing do YAML gerado com loadConfig

### Casos de Teste Especificos

| ID | Cenario | Input | Output Esperado |
|----|---------|-------|-----------------|
| TC01 | Provider OpenAI selecionado | provider="openai" | Config com embeddings.provider="openai" |
| TC02 | Provider Anthropic selecionado | provider="anthropic" | Config com embeddings.provider="openai", llm.provider="anthropic" |
| TC03 | Ollama com URL customizada | provider="ollama", url="http://192.168.1.100:11434/v1" | baseUrl configurado em embeddings e llm |
| TC04 | Config existente sem --reconfigure | Arquivo existe | Prompt de confirmacao exibido |
| TC05 | Config existente com --reconfigure | Arquivo existe, flag ativa | Sobrescreve sem perguntar |

## Riscos e Mitigacoes

| Risco | Probabilidade | Impacto | Mitigacao |
|-------|---------------|---------|-----------|
| Usuario cancela no meio do fluxo | Media | Baixo | Usar `p.isCancel()` em cada passo, graceful exit |
| Diretorio de config sem permissao | Baixa | Medio | Try-catch com mensagem clara de erro |
| API key invalida aceita | Media | Baixo | Validacao basica de formato, usuario pode corrigir depois |
| Conflito com config local (.mgreprc.yaml) | Baixa | Medio | Documentar que global config e gerada, local tem precedencia |

## Checklist de Conclusao

- [ ] Codigo implementado (`src/commands/init.ts`)
- [ ] Comando registrado em `src/index.ts`
- [ ] Testes escritos e passando
- [ ] Documentacao atualizada no README
- [ ] Makefile atualizado para chamar `mgrep init` (opcional)
- [ ] Code review realizado
- [ ] Feature testada em Windows, macOS e Linux

## Notas Adicionais

### Compatibilidade com Makefile Existente
O Makefile pode continuar funcionando como um wrapper opcional. Atualize a target `init-config` para chamar `mgrep init`:

```makefile
init-config:
    @npx mgrep init
```

### Precedencia de Configuracao
Lembrar que a hierarquia e: CLI Flags > Env Vars > Local Config > Global Config > Defaults.
O `mgrep init` gera apenas a Global Config (`~/.config/mgrep/config.yaml`).

### Exemplo de Output do YAML Gerado

```yaml
# mgrep configuration - generated by mgrep init

qdrant:
  url: http://localhost:6333
  collectionPrefix: mgrep_

embeddings:
  provider: openai
  model: text-embedding-3-small
  batchSize: 100
  timeoutMs: 30000
  maxRetries: 3

llm:
  provider: openai
  model: gpt-4o-mini
  temperature: 0.7
  maxTokens: 4096
  timeoutMs: 60000
  maxRetries: 3

sync:
  concurrency: 20

maxFileSize: 10485760
```
