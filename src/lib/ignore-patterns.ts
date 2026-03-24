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

import ignoreData from "./ignore-patterns.json" with { type: "json" };

/**
 * Vendor/dependency directory patterns.
 * These directories contain third-party code that typically shouldn't be indexed.
 */
export const VENDOR_PATTERNS: readonly string[] = ignoreData.vendor.patterns;

/**
 * Generated file patterns.
 * These are files that are automatically generated and shouldn't be indexed.
 */
export const GENERATED_PATTERNS: readonly string[] =
  ignoreData.generated.patterns;

/**
 * Binary and media file patterns.
 * These files are not useful for semantic search.
 */
export const BINARY_PATTERNS: readonly string[] = ignoreData.binary.patterns;

/**
 * Configuration and CI/CD file patterns.
 * These are DISABLED by default as they may contain useful configuration info.
 */
export const CONFIG_PATTERNS: readonly string[] = ignoreData.config.patterns;

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
    description: ignoreData.vendor.description,
    patterns: VENDOR_PATTERNS,
    enabled: ignoreData.vendor.defaultEnabled,
  },
  {
    name: "generated",
    description: ignoreData.generated.description,
    patterns: GENERATED_PATTERNS,
    enabled: ignoreData.generated.defaultEnabled,
  },
  {
    name: "binary",
    description: ignoreData.binary.description,
    patterns: BINARY_PATTERNS,
    enabled: ignoreData.binary.defaultEnabled,
  },
  {
    name: "config",
    description: ignoreData.config.description,
    patterns: CONFIG_PATTERNS,
    enabled: ignoreData.config.defaultEnabled,
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
