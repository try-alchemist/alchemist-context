import { scanFiles } from "../sync/scanner.js";
import { detectStack } from "./stack-detect.js";

export interface CodebaseSummary {
  stack: Record<string, string>;
  hasUI: boolean;
  files: { path: string; exports: string[]; imports: string[] }[];
  fileCount: number;
}

/**
 * Reads project structure and produces a privacy-safe summary
 * (paths, exports, imports — NOT source code contents)
 */
export async function readCodebase(projectRoot: string): Promise<CodebaseSummary> {
  const stack = await detectStack(projectRoot);
  const files = await scanFiles(projectRoot);

  const hasUI = files.some(
    (f) =>
      f.tags.includes("ui") ||
      f.path.includes("component") ||
      f.path.endsWith(".tsx") ||
      f.path.endsWith(".jsx") ||
      f.path.includes("page")
  );

  return {
    stack,
    hasUI,
    files: files.map((f) => ({
      path: f.path,
      exports: f.exports,
      imports: f.imports,
    })),
    fileCount: files.length,
  };
}
