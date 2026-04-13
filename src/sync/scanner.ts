import { readFile, stat } from "node:fs/promises";
import { join, relative, extname } from "node:path";
import { glob } from "glob";
import type { FileEntry } from "../store/context.js";
import { inferTags } from "./patterns.js";

const IMPORT_PATTERNS: Record<string, RegExp[]> = {
  js: [
    /import\s+.*?\s+from\s+["']([^"']+)["']/g,
    /require\(["']([^"']+)["']\)/g,
  ],
  ts: [
    /import\s+.*?\s+from\s+["']([^"']+)["']/g,
    /import\s+type\s+.*?\s+from\s+["']([^"']+)["']/g,
  ],
  py: [
    /from\s+(\S+)\s+import/g,
    /import\s+(\S+)/g,
  ],
  go: [
    /"([^"]+)"/g,  // inside import blocks
  ],
  rs: [
    /use\s+(\S+)/g,
  ],
};

const EXPORT_PATTERNS: Record<string, RegExp[]> = {
  js: [
    /export\s+(?:default\s+)?(?:function|class|const|let|var|interface|type|enum)\s+(\w+)/g,
  ],
  ts: [
    /export\s+(?:default\s+)?(?:function|class|const|let|var|interface|type|enum)\s+(\w+)/g,
  ],
  py: [
    /^(?:def|class)\s+(\w+)/gm,
  ],
  go: [
    /^func\s+(\w+)/gm,
  ],
  rs: [
    /pub\s+(?:fn|struct|enum|trait|type)\s+(\w+)/g,
  ],
};

const EXT_TO_LANG: Record<string, string> = {
  ".js": "js", ".jsx": "js", ".mjs": "js", ".cjs": "js",
  ".ts": "ts", ".tsx": "ts", ".mts": "ts",
  ".py": "py",
  ".go": "go",
  ".rs": "rs",
};

const SOURCE_GLOBS = [
  "**/*.{ts,tsx,js,jsx,mjs,cjs}",
  "**/*.py",
  "**/*.go",
  "**/*.rs",
  "**/*.swift",
  "**/*.kt",
];

const DEFAULT_IGNORE = [
  "node_modules/**",
  ".next/**",
  "dist/**",
  "build/**",
  ".git/**",
  "*.lock",
  "*.min.js",
  ".alchemist/**",
  "coverage/**",
  "__pycache__/**",
  "target/**",
  "vendor/**",
];

export async function scanFiles(
  projectRoot: string,
  ignorePatterns: string[] = [],
  tagRules: Record<string, string[]> = {}
): Promise<FileEntry[]> {
  const ignore = [...DEFAULT_IGNORE, ...ignorePatterns];

  const files: string[] = [];
  for (const pattern of SOURCE_GLOBS) {
    const matches = await glob(pattern, { cwd: projectRoot, ignore, nodir: true });
    files.push(...matches);
  }

  // Deduplicate
  const unique = [...new Set(files)];

  const entries: FileEntry[] = [];
  for (const relPath of unique) {
    const absPath = join(projectRoot, relPath);
    const ext = extname(relPath);
    const lang = EXT_TO_LANG[ext];

    let content: string;
    try {
      content = await readFile(absPath, "utf-8");
    } catch {
      continue;
    }

    let fileStat;
    try {
      fileStat = await stat(absPath);
    } catch {
      continue;
    }

    const imports = lang ? extractMatches(content, IMPORT_PATTERNS[lang]) : [];
    const exports = lang ? extractMatches(content, EXPORT_PATTERNS[lang]) : [];
    const purpose = inferPurpose(relPath, exports);
    const tags = inferTags(relPath, tagRules);

    entries.push({
      path: relPath,
      purpose,
      exports: exports.slice(0, 10), // cap to avoid bloat
      imports: imports.slice(0, 15),
      lastModified: fileStat.mtime.toISOString(),
      tags,
    });
  }

  return entries;
}

function extractMatches(content: string, patterns?: RegExp[]): string[] {
  if (!patterns) return [];
  const results: string[] = [];
  for (const pattern of patterns) {
    // Reset lastIndex for global patterns
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(content)) !== null) {
      if (match[1]) results.push(match[1]);
    }
  }
  return [...new Set(results)];
}

function inferPurpose(filePath: string, exports: string[]): string {
  const lower = filePath.toLowerCase();

  if (lower.includes("test") || lower.includes("spec")) return "Test file";
  if (lower.includes("config")) return "Configuration";
  if (lower.includes("middleware")) return "Middleware";
  if (lower.includes("route") || lower.includes("api")) return "API route";
  if (lower.includes("hook") || lower.includes("use")) return "Hook";
  if (lower.includes("component") || lower.includes("ui")) return "UI component";
  if (lower.includes("store") || lower.includes("state")) return "State management";
  if (lower.includes("util") || lower.includes("helper") || lower.includes("lib")) return "Utility";
  if (lower.includes("schema") || lower.includes("model")) return "Data model";
  if (lower.includes("type")) return "Type definitions";
  if (lower.includes("index")) return "Module entry";
  if (lower.includes("page") || lower.includes("screen")) return "Page/Screen";
  if (lower.includes("layout")) return "Layout component";

  if (exports.length > 0) {
    return `Exports: ${exports.slice(0, 3).join(", ")}`;
  }
  return "Source file";
}
