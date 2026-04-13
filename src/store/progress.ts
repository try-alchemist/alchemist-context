import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

export interface ProgressEntry {
  id: string;
  text: string;
  capturedAt: string;
  source: "auto-capture" | "manual";
}

interface ProgressStore {
  progress: ProgressEntry[];
}

function progressPath(projectRoot: string): string {
  return join(projectRoot, ".alchemist", "progress.json");
}

export async function readProgress(projectRoot: string): Promise<ProgressEntry[]> {
  try {
    const raw = await readFile(progressPath(projectRoot), "utf-8");
    const store = JSON.parse(raw) as ProgressStore;
    return Array.isArray(store.progress) ? store.progress : [];
  } catch {
    return [];
  }
}

export async function writeProgress(projectRoot: string, progress: ProgressEntry[]): Promise<void> {
  await writeFile(progressPath(projectRoot), JSON.stringify({ progress }, null, 2), "utf-8");
}

export async function addProgress(
  projectRoot: string,
  text: string,
  source: "auto-capture" | "manual" = "auto-capture"
): Promise<ProgressEntry> {
  const progress = await readProgress(projectRoot);
  const entry: ProgressEntry = {
    id: randomUUID(),
    text,
    capturedAt: new Date().toISOString(),
    source,
  };
  progress.push(entry);
  await writeProgress(projectRoot, progress);
  return entry;
}
