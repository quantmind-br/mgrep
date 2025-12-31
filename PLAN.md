# Plano de Melhoria: Padrões de Ignore do mgrep

## Sumario Executivo

Este documento detalha um plano abrangente para melhorar os padroes de ignore do mgrep, baseado em pesquisa de ferramentas de referencia (ripgrep, Silver Searcher, GitHub Linguist, Semgrep) e melhores praticas da industria.

**Estado Atual**: O mgrep possui um sistema basico de ignore:
- `DEFAULT_IGNORE_PATTERNS`: 7 padroes hardcoded
- Respeita `.gitignore` e `.mgrepignore`
- Detecta binarios via `istextorbinary`
- Ignora arquivos ocultos (dotfiles)

**Problema**: Padroes insuficientes resultam em:
1. Indexacao de arquivos vendored (ex: `node_modules` fora de repos git)
2. Indexacao de arquivos gerados (ex: `.min.js`, sourcemaps)
3. Indexacao de lock files desnecessarios
4. Falta de deteccao inteligente de binarios

---

## Fase 1: Expansao de Padroes Padrao

### 1.1 Padroes de Dependencias/Vendor (Alta Prioridade)

Baseado em GitHub Linguist `vendor.yml`:

```typescript
// src/lib/file.ts - VENDOR_PATTERNS
export const VENDOR_PATTERNS: readonly string[] = [
  // Node.js
  "node_modules/",
  ".yarn/releases/",
  ".yarn/plugins/",
  ".yarn/sdks/",
  ".yarn/unplugged/",
  ".pnp.*",
  
  // Python
  "venv/",
  ".venv/",
  "env/",
  ".env/",
  "__pycache__/",
  "*.egg-info/",
  ".eggs/",
  "site-packages/",
  
  // Ruby
  "vendor/bundle/",
  
  // Go
  "vendor/",
  "Godeps/",
  
  // PHP
  "vendor/",
  
  // Rust
  "target/",
  
  // .NET
  "packages/",
  "bin/",
  "obj/",
  
  // iOS/macOS
  "Pods/",
  "Carthage/Build/",
  
  // Java/Kotlin
  "gradle/wrapper/",
  ".gradle/",
  
  // Generic
  "bower_components/",
  "jspm_packages/",
  "web_modules/",
  "deps/",
  "third_party/",
  "third-party/",
  "3rdparty/",
  "externals/",
  "external/",
];
```

### 1.2 Padroes de Arquivos Gerados (Alta Prioridade)

Baseado em GitHub Linguist `generated.rb`:

```typescript
// src/lib/file.ts - GENERATED_PATTERNS
export const GENERATED_PATTERNS: readonly string[] = [
  // Minified files
  "*.min.js",
  "*.min.css",
  "*.min.mjs",
  "*-min.js",
  "*-min.css",
  
  // Source maps
  "*.map",
  "*.js.map",
  "*.css.map",
  
  // Bundled output
  "dist/",
  "build/",
  "out/",
  ".next/",
  ".nuxt/",
  ".output/",
  ".svelte-kit/",
  
  // Lock files
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lockb",
  "bun.lock",
  "composer.lock",
  "Gemfile.lock",
  "Cargo.lock",
  "poetry.lock",
  "pdm.lock",
  "uv.lock",
  "pixi.lock",
  "Pipfile.lock",
  "go.sum",
  "Gopkg.lock",
  "glide.lock",
  "flake.lock",
  "deno.lock",
  "Package.resolved",
  ".terraform.lock.hcl",
  "MODULE.bazel.lock",
  "pnpm-workspace.yaml",
  
  // Generated code markers
  "*.generated.*",
  "*.g.dart",
  "*.freezed.dart",
  "*.gr.dart",
  "*.pb.go",
  "*.pb.cc",
  "*.pb.h",
  "*.pb.js",
  "*.pb.ts",
  "*_pb2.py",
  "*.designer.cs",
  "*.designer.vb",
  
  // Proto/Thrift generated
  "__generated__/",
  
  // Type definitions (vendored)
  "*.d.ts",
  
  // IDE generated
  ".idea/",
  "*.xcworkspacedata",
  "*.xcuserstate",
  
  // Test fixtures/snapshots
  "__snapshots__/",
  "*.snap",
  
  // Coverage reports  
  "coverage/",
  "htmlcov/",
  ".nyc_output/",
  
  // Documentation generated
  "docs/_build/",
  "site/",
  "_site/",
  "javadoc/",
  "apidoc/",
];
```

### 1.3 Padroes de Arquivos Binarios (Media Prioridade)

Expandir `DEFAULT_IGNORE_PATTERNS`:

```typescript
// src/lib/file.ts - BINARY_PATTERNS
export const BINARY_PATTERNS: readonly string[] = [
  // Existing patterns
  "*.lock",
  "*.bin",
  "*.ipynb",
  "*.pyc",
  "*.safetensors",
  "*.sqlite",
  "*.pt",
  
  // Executables
  "*.exe",
  "*.dll",
  "*.so",
  "*.dylib",
  "*.a",
  "*.lib",
  "*.o",
  "*.obj",
  "*.class",
  "*.jar",
  "*.war",
  "*.ear",
  
  // Archives
  "*.zip",
  "*.tar",
  "*.gz",
  "*.bz2",
  "*.xz",
  "*.7z",
  "*.rar",
  "*.tgz",
  "*.tbz2",
  
  // Images
  "*.png",
  "*.jpg",
  "*.jpeg",
  "*.gif",
  "*.bmp",
  "*.ico",
  "*.icns",
  "*.webp",
  "*.avif",
  "*.heic",
  "*.heif",
  "*.tiff",
  "*.tif",
  "*.psd",
  "*.ai",
  "*.eps",
  "*.svg",  // Opcional - pode conter codigo
  
  // Audio/Video
  "*.mp3",
  "*.mp4",
  "*.wav",
  "*.ogg",
  "*.flac",
  "*.aac",
  "*.m4a",
  "*.wma",
  "*.avi",
  "*.mkv",
  "*.mov",
  "*.wmv",
  "*.flv",
  "*.webm",
  
  // Fonts
  "*.ttf",
  "*.otf",
  "*.woff",
  "*.woff2",
  "*.eot",
  
  // Documents
  "*.pdf",
  "*.doc",
  "*.docx",
  "*.xls",
  "*.xlsx",
  "*.ppt",
  "*.pptx",
  "*.odt",
  "*.ods",
  "*.odp",
  
  // Databases
  "*.db",
  "*.sqlite3",
  "*.mdb",
  "*.accdb",
  
  // Machine Learning
  "*.onnx",
  "*.h5",
  "*.hdf5",
  "*.pkl",
  "*.pickle",
  "*.joblib",
  "*.npy",
  "*.npz",
  "*.ckpt",
  "*.pth",
  "*.model",
  "*.weights",
  
  // Game/3D assets
  "*.fbx",
  "*.obj",
  "*.gltf",
  "*.glb",
  "*.blend",
  "*.unity",
  "*.prefab",
  "*.asset",
];
```

### 1.4 Padroes de CI/Config (Baixa Prioridade)

```typescript
// src/lib/file.ts - CONFIG_PATTERNS (opcional, pode ser controverso)
export const CONFIG_PATTERNS: readonly string[] = [
  // CI/CD
  ".github/",
  ".gitlab/",
  ".circleci/",
  ".travis.yml",
  "Jenkinsfile",
  "azure-pipelines.yml",
  
  // Containerization
  "Dockerfile*",
  "docker-compose*.yml",
  ".dockerignore",
  
  // Editor/IDE settings
  ".vscode/",
  ".idea/",
  "*.sublime-*",
  ".editorconfig",
  
  // Git
  ".gitattributes",
  ".gitmodules",
  
  // Dependency managers config
  ".npmrc",
  ".yarnrc*",
  ".nvmrc",
  ".python-version",
  ".ruby-version",
  ".node-version",
  "Brewfile",
];
```

---

## Fase 2: Arquitetura de Configuracao

### 2.1 Estrutura de Padroes por Categoria

```typescript
// src/lib/ignore-patterns.ts (novo arquivo)

export interface IgnoreCategory {
  name: string;
  description: string;
  patterns: readonly string[];
  enabled: boolean;  // padrao
}

export const IGNORE_CATEGORIES: IgnoreCategory[] = [
  {
    name: "vendor",
    description: "Third-party dependencies and vendor directories",
    patterns: VENDOR_PATTERNS,
    enabled: true,
  },
  {
    name: "generated",
    description: "Generated code, build outputs, and lock files",
    patterns: GENERATED_PATTERNS,
    enabled: true,
  },
  {
    name: "binary",
    description: "Binary and media files",
    patterns: BINARY_PATTERNS,
    enabled: true,
  },
  {
    name: "config",
    description: "Configuration and CI/CD files",
    patterns: CONFIG_PATTERNS,
    enabled: false,  // desabilitado por padrao - pode conter informacoes uteis
  },
];

export function getDefaultIgnorePatterns(
  enabledCategories?: string[]
): string[] {
  const categories = enabledCategories 
    ? IGNORE_CATEGORIES.filter(c => enabledCategories.includes(c.name))
    : IGNORE_CATEGORIES.filter(c => c.enabled);
  
  return categories.flatMap(c => [...c.patterns]);
}
```

### 2.2 Configuracao via `.mgreprc.yaml`

```yaml
# .mgreprc.yaml exemplo

# Habilitar/desabilitar categorias
ignore:
  categories:
    vendor: true      # default: true
    generated: true   # default: true  
    binary: true      # default: true
    config: false     # default: false

  # Padroes adicionais customizados
  additional:
    - "*.proprietary"
    - "internal-tools/"
    - "legacy/"

  # Excecoes (negar padroes)
  exceptions:
    - "!dist/index.js"       # manter este arquivo especifico
    - "!*.d.ts"              # manter type definitions
    - "!vendor/important/"   # manter este vendor
```

### 2.3 Schema Zod Atualizado

```typescript
// src/lib/config.ts

const IgnoreConfigSchema = z.object({
  categories: z.object({
    vendor: z.boolean().default(true),
    generated: z.boolean().default(true),
    binary: z.boolean().default(true),
    config: z.boolean().default(false),
  }).default({}),
  additional: z.array(z.string()).default([]),
  exceptions: z.array(z.string()).default([]),
}).default({});

// Adicionar ao ConfigSchema
export const ConfigSchema = z.object({
  // ... existing fields
  ignore: IgnoreConfigSchema,
});
```

---

## Fase 3: Deteccao Inteligente

### 3.1 Deteccao de Arquivos Minificados

Baseado em GitHub Linguist - detectar arquivos minificados por conteudo:

```typescript
// src/lib/file-analysis.ts

export function isMinified(content: string, extension: string): boolean {
  // Apenas para .js e .css
  if (!['.js', '.css', '.mjs'].includes(extension)) {
    return false;
  }
  
  const lines = content.split('\n');
  if (lines.length === 0) return false;
  
  // Minificado se linha media > 500 caracteres
  const avgLineLength = content.length / lines.length;
  if (avgLineLength > 500) return true;
  
  // Ou se tem menos de 10 linhas e > 10KB
  if (lines.length < 10 && content.length > 10000) return true;
  
  return false;
}
```

### 3.2 Deteccao de Arquivos Gerados por Header

```typescript
// src/lib/file-analysis.ts

const GENERATED_MARKERS = [
  /^\/\/ Code generated .* DO NOT EDIT/i,
  /^\/\/ Generated by /i,
  /^# Generated by /i,
  /^\/\* Generated by /i,
  /^\/\/ This file is automatically generated/i,
  /^# This file is automatically generated/i,
  /^\/\/ AUTO-GENERATED/i,
  /^# AUTO-GENERATED/i,
  /^\/\*\s*eslint-disable\s*\*\/\s*$/,  // Comum em arquivos gerados
];

export function hasGeneratedMarker(content: string): boolean {
  const firstLines = content.split('\n').slice(0, 10);
  return firstLines.some(line => 
    GENERATED_MARKERS.some(marker => marker.test(line.trim()))
  );
}
```

### 3.3 Deteccao de Source Maps

```typescript
// src/lib/file-analysis.ts

export function hasSourceMapReference(content: string): boolean {
  const lastLines = content.split('\n').slice(-3);
  return lastLines.some(line => 
    /^\/[/*][@#]\s*sourceMappingURL=/.test(line) ||
    /^\/[/*][@#]\s*sourceURL=/.test(line)
  );
}
```

---

## Fase 4: Implementacao

### 4.1 Sprint 1: Padroes Base (Prioridade Alta)

| Tarefa | Arquivo | Esforco |
|--------|---------|---------|
| Criar `src/lib/ignore-patterns.ts` | Novo | 2h |
| Expandir `DEFAULT_IGNORE_PATTERNS` | `file.ts` | 1h |
| Adicionar `VENDOR_PATTERNS` | `ignore-patterns.ts` | 1h |
| Adicionar `GENERATED_PATTERNS` | `ignore-patterns.ts` | 1h |
| Adicionar `BINARY_PATTERNS` | `ignore-patterns.ts` | 1h |
| Testes unitarios | `ignore-patterns.test.ts` | 2h |

### 4.2 Sprint 2: Configuracao (Prioridade Media)

| Tarefa | Arquivo | Esforco |
|--------|---------|---------|
| Atualizar schema Zod | `config.ts` | 1h |
| Integrar categorias no FileSystem | `file.ts` | 2h |
| Suporte a excecoes (`!pattern`) | `file.ts` | 2h |
| Testes de configuracao | `config.test.ts` | 1h |

### 4.3 Sprint 3: Deteccao Inteligente (Prioridade Baixa)

| Tarefa | Arquivo | Esforco |
|--------|---------|---------|
| Criar `src/lib/file-analysis.ts` | Novo | 2h |
| Implementar `isMinified()` | `file-analysis.ts` | 1h |
| Implementar `hasGeneratedMarker()` | `file-analysis.ts` | 1h |
| Integrar no sync pipeline | `utils.ts` | 2h |
| Testes | `file-analysis.test.ts` | 2h |

---

## Fase 5: CLI e UX

### 5.1 Novos Comandos/Flags

```bash
# Listar padroes ativos
mgrep config --show-ignore

# Testar se arquivo seria ignorado
mgrep check-ignore path/to/file.js

# Dry run mostrando arquivos ignorados
mgrep sync --dry-run --show-ignored

# Override categoria
mgrep sync --include-vendor  # indexar vendor/
mgrep sync --include-generated  # indexar arquivos gerados
```

### 5.2 Output Melhorado no Sync

```
Syncing /project...
  Files: 234 indexed, 1,847 ignored
  
Ignored breakdown:
  - vendor:    1,203 files (node_modules/, vendor/)
  - generated:   412 files (dist/, *.min.js)
  - binary:      189 files (*.png, *.pdf)
  - gitignore:    43 files (.env, secrets/)
```

---

## Fase 6: Documentacao

### 6.1 Atualizar README.md

```markdown
## File Filtering

mgrep automatically ignores files that are not useful for semantic search:

### Default Categories

| Category | Examples | Configurable |
|----------|----------|--------------|
| `vendor` | `node_modules/`, `vendor/`, `Pods/` | Yes |
| `generated` | `dist/`, `*.min.js`, lock files | Yes |
| `binary` | `*.png`, `*.pdf`, `*.exe` | Yes |
| `config` | `.github/`, `Dockerfile` | Yes (off by default) |

### Custom Configuration

```yaml
# .mgreprc.yaml
ignore:
  categories:
    vendor: true
    generated: true
    config: true  # enable config indexing
  additional:
    - "internal/"
  exceptions:
    - "!vendor/important-lib/"
```

### Precedence

1. `.gitignore` (in git repos)
2. `.mgrepignore`
3. Default patterns (configurable)
4. CLI flags
```

### 6.2 Criar `.mgrepignore.example`

```gitignore
# Example .mgrepignore file
# Uses gitignore syntax

# Project-specific exclusions
internal-tools/
legacy-code/
*.proprietary

# Override default behavior
!dist/bundle.js  # Keep this generated file
!*.d.ts          # Keep TypeScript definitions
```

---

## Metricas de Sucesso

| Metrica | Atual | Meta |
|---------|-------|------|
| Padroes vendor detectados | ~0 (fora de git) | 50+ |
| Padroes generated | 0 | 40+ |
| Padroes binary | 7 | 80+ |
| Configurabilidade | Nenhuma | Completa |
| Tempo de sync (repo medio) | Baseline | -30% (menos arquivos) |

---

## Riscos e Mitigacoes

| Risco | Impacto | Mitigacao |
|-------|---------|-----------|
| Over-filtering (ignorar demais) | Alto | Sistema de excecoes, dry-run, categorias opcionais |
| Breaking changes | Medio | Feature flag para novos padroes, migracao gradual |
| Performance regex | Baixo | Pre-compilar patterns, usar `ignore` library |
| Complexidade config | Medio | Defaults sensatos, documentacao clara |

---

## Referencias

- [GitHub Linguist vendor.yml](https://github.com/github-linguist/linguist/blob/main/lib/linguist/vendor.yml)
- [GitHub Linguist generated.rb](https://github.com/github-linguist/linguist/blob/main/lib/linguist/generated.rb)
- [ripgrep GUIDE.md](https://github.com/BurntSushi/ripgrep/blob/master/GUIDE.md)
- [Silver Searcher ignore](https://github.com/ggreer/the_silver_searcher)
- [Semgrep ignore docs](https://semgrep.dev/docs/ignoring-files-folders-code)
- [Sourcegraph search config](https://sourcegraph.com/docs/admin/search)

---

## Apendice: Lista Completa de Padroes Sugeridos

### A.1 VENDOR_PATTERNS (53 padroes)

```
node_modules/
.yarn/releases/
.yarn/plugins/
.yarn/sdks/
.yarn/unplugged/
.pnp.*
venv/
.venv/
env/
.env/
__pycache__/
*.egg-info/
.eggs/
site-packages/
vendor/bundle/
vendor/
Godeps/
target/
packages/
bin/
obj/
Pods/
Carthage/Build/
gradle/wrapper/
.gradle/
bower_components/
jspm_packages/
web_modules/
deps/
third_party/
third-party/
3rdparty/
externals/
external/
.bundle/
_vendor/
elm-stuff/
.stack-work/
.cabal-sandbox/
.cache/
cache/
.parcel-cache/
.turbo/
.vercel/
.netlify/
.serverless/
.angular/
.rpt2_cache/
.fusebox/
```

### A.2 GENERATED_PATTERNS (67 padroes)

```
*.min.js
*.min.css
*.min.mjs
*-min.js
*-min.css
*.map
*.js.map
*.css.map
dist/
build/
out/
.next/
.nuxt/
.output/
.svelte-kit/
package-lock.json
pnpm-lock.yaml
yarn.lock
bun.lockb
bun.lock
composer.lock
Gemfile.lock
Cargo.lock
poetry.lock
pdm.lock
uv.lock
pixi.lock
Pipfile.lock
go.sum
Gopkg.lock
glide.lock
flake.lock
deno.lock
Package.resolved
.terraform.lock.hcl
MODULE.bazel.lock
*.generated.*
*.g.dart
*.freezed.dart
*.gr.dart
*.pb.go
*.pb.cc
*.pb.h
*.pb.js
*.pb.ts
*_pb2.py
*.designer.cs
*.designer.vb
__generated__/
*.d.ts
.idea/
*.xcworkspacedata
*.xcuserstate
__snapshots__/
*.snap
coverage/
htmlcov/
.nyc_output/
docs/_build/
site/
_site/
javadoc/
apidoc/
*.chunk.js
*.bundle.js
```

### A.3 BINARY_PATTERNS (89 padroes)

```
*.lock
*.bin
*.ipynb
*.pyc
*.safetensors
*.sqlite
*.pt
*.exe
*.dll
*.so
*.dylib
*.a
*.lib
*.o
*.obj
*.class
*.jar
*.war
*.ear
*.zip
*.tar
*.gz
*.bz2
*.xz
*.7z
*.rar
*.tgz
*.tbz2
*.png
*.jpg
*.jpeg
*.gif
*.bmp
*.ico
*.icns
*.webp
*.avif
*.heic
*.heif
*.tiff
*.tif
*.psd
*.ai
*.eps
*.mp3
*.mp4
*.wav
*.ogg
*.flac
*.aac
*.m4a
*.wma
*.avi
*.mkv
*.mov
*.wmv
*.flv
*.webm
*.ttf
*.otf
*.woff
*.woff2
*.eot
*.pdf
*.doc
*.docx
*.xls
*.xlsx
*.ppt
*.pptx
*.odt
*.ods
*.odp
*.db
*.sqlite3
*.mdb
*.accdb
*.onnx
*.h5
*.hdf5
*.pkl
*.pickle
*.joblib
*.npy
*.npz
*.ckpt
*.pth
*.model
*.weights
```

---

*Ultima atualizacao: 2025-12-31 | Versao 2.0*
