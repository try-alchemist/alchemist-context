import type { Pattern } from "../store/context.js";
import type { FileEntry } from "../store/context.js";

/**
 * Infer tags from file path using custom tag rules + built-in heuristics
 */
export function inferTags(
  filePath: string,
  tagRules: Record<string, string[]> = {}
): string[] {
  const tags: string[] = [];

  // Apply custom rules first
  for (const [pathPrefix, ruleTags] of Object.entries(tagRules)) {
    if (filePath.startsWith(pathPrefix)) {
      tags.push(...ruleTags);
    }
  }

  // Built-in heuristics
  const lower = filePath.toLowerCase();
  if (lower.includes("auth")) tags.push("auth");
  if (lower.includes("api") || lower.includes("route")) tags.push("api");
  if (lower.includes("component") || lower.includes("ui") || lower.includes(".tsx") || lower.includes(".jsx")) tags.push("ui");
  if (lower.includes("hook") || lower.match(/use[A-Z]/)) tags.push("hooks");
  if (lower.includes("store") || lower.includes("state") || lower.includes("slice")) tags.push("state");
  if (lower.includes("test") || lower.includes("spec")) tags.push("test");
  if (lower.includes("schema") || lower.includes("model") || lower.includes("migration")) tags.push("data");
  if (lower.includes("middleware")) tags.push("middleware");
  if (lower.includes("config")) tags.push("config");
  if (lower.includes("util") || lower.includes("helper") || lower.includes("lib")) tags.push("util");
  if (lower.includes("page") || lower.includes("screen")) tags.push("page");
  if (lower.includes("layout")) tags.push("layout");
  if (lower.includes("style") || lower.includes("css") || lower.includes("theme")) tags.push("style");
  if (lower.includes("payment") || lower.includes("billing") || lower.includes("stripe")) tags.push("payments");

  return [...new Set(tags)];
}

/**
 * Detect common patterns across all project files
 */
export function detectPatterns(files: FileEntry[]): Pattern[] {
  const patterns: Pattern[] = [];

  // Detect state management pattern
  const stateFiles = files.filter((f) => f.tags.includes("state"));
  if (stateFiles.length > 0) {
    const hasZustand = stateFiles.some((f) => f.imports.some((i) => i.includes("zustand")));
    const hasRedux = stateFiles.some((f) => f.imports.some((i) => i.includes("redux") || i.includes("@reduxjs")));
    const hasJotai = stateFiles.some((f) => f.imports.some((i) => i.includes("jotai")));
    const lib = hasZustand ? "Zustand" : hasRedux ? "Redux" : hasJotai ? "Jotai" : "custom";
    patterns.push({
      name: `${lib} state management`,
      files: stateFiles.map((f) => f.path),
      description: `State managed with ${lib} across ${stateFiles.length} file(s)`,
    });
  }

  // Detect API layer pattern
  const apiFiles = files.filter((f) => f.tags.includes("api"));
  if (apiFiles.length > 0) {
    patterns.push({
      name: "API layer",
      files: apiFiles.map((f) => f.path),
      description: `${apiFiles.length} API/route file(s)`,
    });
  }

  // Detect test pattern
  const testFiles = files.filter((f) => f.tags.includes("test"));
  if (testFiles.length > 0) {
    const hasVitest = testFiles.some((f) => f.imports.some((i) => i.includes("vitest")));
    const hasJest = testFiles.some((f) => f.imports.some((i) => i.includes("jest") || i.includes("@jest")));
    const framework = hasVitest ? "Vitest" : hasJest ? "Jest" : "unknown";
    patterns.push({
      name: `${framework} testing`,
      files: testFiles.map((f) => f.path),
      description: `${testFiles.length} test file(s) using ${framework}`,
    });
  }

  // Detect auth pattern
  const authFiles = files.filter((f) => f.tags.includes("auth"));
  if (authFiles.length > 0) {
    patterns.push({
      name: "Authentication",
      files: authFiles.map((f) => f.path),
      description: `${authFiles.length} auth-related file(s)`,
    });
  }

  return patterns;
}
