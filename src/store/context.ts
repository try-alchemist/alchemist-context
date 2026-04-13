import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface FileEntry {
  path: string;
  purpose: string;
  exports: string[];
  imports: string[];
  lastModified: string;
  tags: string[];
}

export interface Pattern {
  name: string;
  files: string[];
  description: string;
}

export interface Dependency {
  name: string;
  version: string;
  type: "production" | "dev";
}

export interface RecentChange {
  hash: string;
  message: string;
  date: string;
  filesChanged: string[];
}

export interface ProjectContext {
  projectName: string;
  generatedAt: string;
  seedVersion: string;
  stack: Record<string, string>;
  files: FileEntry[];
  patterns: Pattern[];
  dependencies: Dependency[];
  recentChanges: RecentChange[];
}

function contextPath(projectRoot: string): string {
  return join(projectRoot, ".alchemist", "context.json");
}

export async function readContext(projectRoot: string): Promise<ProjectContext | null> {
  try {
    const raw = await readFile(contextPath(projectRoot), "utf-8");
    return JSON.parse(raw) as ProjectContext;
  } catch {
    return null;
  }
}

export async function writeContext(projectRoot: string, ctx: ProjectContext): Promise<void> {
  await writeFile(contextPath(projectRoot), JSON.stringify(ctx, null, 2), "utf-8");
}
