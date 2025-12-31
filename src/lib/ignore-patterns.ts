/**
 * Comprehensive ignore patterns for mgrep file indexing.
 *
 * Based on:
 * - GitHub Linguist vendor.yml and generated.rb
 * - ripgrep, Silver Searcher ignore patterns
 * - Semgrep ignore documentation
 *
 * @see https://github.com/github-linguist/linguist/blob/main/lib/linguist/vendor.yml
 * @see https://github.com/github-linguist/linguist/blob/main/lib/linguist/generated.rb
 */

/**
 * Vendor/dependency directory patterns.
 * These directories contain third-party code that typically shouldn't be indexed.
 */
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
  ".bundle/",

  // Go
  "vendor/",
  "Godeps/",

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

  // Generic vendor directories
  "bower_components/",
  "jspm_packages/",
  "web_modules/",
  "deps/",
  "third_party/",
  "third-party/",
  "3rdparty/",
  "externals/",
  "external/",
  "_vendor/",

  // Haskell
  ".stack-work/",
  ".cabal-sandbox/",

  // Elm
  "elm-stuff/",

  // Cache directories
  ".cache/",
  "cache/",
  ".parcel-cache/",
  ".turbo/",
  ".vercel/",
  ".netlify/",
  ".serverless/",
  ".angular/",
  ".rpt2_cache/",
  ".fusebox/",
];

/**
 * Generated file patterns.
 * These are files that are automatically generated and shouldn't be indexed.
 */
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

  // Bundled output directories
  "dist/",
  "build/",
  "out/",
  ".next/",
  ".nuxt/",
  ".output/",
  ".svelte-kit/",

  // Lock files (all ecosystems)
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

  // Type definitions (vendored/generated)
  "*.d.ts",

  // IDE generated
  ".idea/",
  "*.xcworkspacedata",
  "*.xcuserstate",

  // Test snapshots
  "__snapshots__/",
  "*.snap",

  // Coverage reports
  "coverage/",
  "htmlcov/",
  ".nyc_output/",

  // Documentation builds
  "docs/_build/",
  "site/",
  "_site/",
  "javadoc/",
  "apidoc/",

  // Bundle files
  "*.chunk.js",
  "*.bundle.js",
];

/**
 * Binary and media file patterns.
 * These files are not useful for semantic search.
 */
export const BINARY_PATTERNS: readonly string[] = [
  // Legacy patterns (from original DEFAULT_IGNORE_PATTERNS)
  "*.lock",
  "*.bin",
  "*.ipynb",
  "*.pyc",
  "*.safetensors",
  "*.sqlite",
  "*.pt",

  // Executables and libraries
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

  // Audio
  "*.mp3",
  "*.wav",
  "*.ogg",
  "*.flac",
  "*.aac",
  "*.m4a",
  "*.wma",

  // Video
  "*.mp4",
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

  // Machine Learning models
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
  "*.gltf",
  "*.glb",
  "*.blend",
  "*.unity",
  "*.prefab",
  "*.asset",
];

/**
 * Configuration and CI/CD file patterns.
 * These are DISABLED by default as they may contain useful configuration info.
 */
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

/**
 * Category name type for type safety
 */
export type IgnoreCategoryName = "vendor" | "generated" | "binary" | "config";

/**
 * Configuration for an ignore pattern category
 */
export interface IgnoreCategory {
  /** Category identifier */
  name: IgnoreCategoryName;
  /** Human-readable description */
  description: string;
  /** Glob patterns in this category */
  patterns: readonly string[];
  /** Whether this category is enabled by default */
  enabled: boolean;
}

/**
 * All available ignore categories with their patterns and default states.
 */
export const IGNORE_CATEGORIES: readonly IgnoreCategory[] = [
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
    description: "Configuration and CI/CD files (disabled by default)",
    patterns: CONFIG_PATTERNS,
    enabled: false,
  },
];

/**
 * Configuration for which categories to enable
 */
export interface IgnoreCategoriesConfig {
  vendor?: boolean;
  generated?: boolean;
  binary?: boolean;
  config?: boolean;
}

/**
 * Get all default ignore patterns based on enabled categories.
 *
 * @param categoriesConfig - Optional config to override default enabled states.
 *                           If not provided, uses default enabled states from IGNORE_CATEGORIES.
 * @returns Array of all patterns from enabled categories
 *
 * @example
 * // Get all default patterns (vendor, generated, binary enabled)
 * const patterns = getDefaultIgnorePatterns();
 *
 * @example
 * // Get only vendor patterns
 * const vendorOnly = getDefaultIgnorePatterns({ vendor: true, generated: false, binary: false });
 *
 * @example
 * // Include config patterns (disabled by default)
 * const withConfig = getDefaultIgnorePatterns({ config: true });
 */
export function getDefaultIgnorePatterns(
  categoriesConfig?: IgnoreCategoriesConfig,
): string[] {
  const patterns: string[] = [];

  for (const category of IGNORE_CATEGORIES) {
    // If config is provided, use it; otherwise use the category's default
    const isEnabled = categoriesConfig?.[category.name] ?? category.enabled;

    if (isEnabled) {
      patterns.push(...category.patterns);
    }
  }

  return patterns;
}

/**
 * Get patterns for a specific category by name.
 *
 * @param categoryName - Name of the category to get patterns for
 * @returns Array of patterns for the category, or empty array if not found
 */
export function getCategoryPatterns(
  categoryName: IgnoreCategoryName,
): readonly string[] {
  const category = IGNORE_CATEGORIES.find((c) => c.name === categoryName);
  return category?.patterns ?? [];
}

/**
 * Get all category names
 */
export function getCategoryNames(): IgnoreCategoryName[] {
  return IGNORE_CATEGORIES.map((c) => c.name);
}

/**
 * Get category metadata (without patterns) for display purposes
 */
export function getCategoryInfo(): Array<{
  name: IgnoreCategoryName;
  description: string;
  patternCount: number;
  enabled: boolean;
}> {
  return IGNORE_CATEGORIES.map((c) => ({
    name: c.name,
    description: c.description,
    patternCount: c.patterns.length,
    enabled: c.enabled,
  }));
}
