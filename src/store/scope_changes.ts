import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

export interface ScopeChange {
  id: string;
  text: string;
  capturedAt: string;
  source: "auto-capture" | "manual";
}

interface ScopeChangesStore {
  scope_changes: ScopeChange[];
}

function scopeChangesPath(projectRoot: string): string {
  return join(projectRoot, ".alchemist", "scope_changes.json");
}

export async function readScopeChanges(projectRoot: string): Promise<ScopeChange[]> {
  try {
    const raw = await readFile(scopeChangesPath(projectRoot), "utf-8");
    const store = JSON.parse(raw) as ScopeChangesStore;
    return Array.isArray(store.scope_changes) ? store.scope_changes : [];
  } catch {
    return [];
  }
}

export async function writeScopeChanges(projectRoot: string, scopeChanges: ScopeChange[]): Promise<void> {
  await writeFile(scopeChangesPath(projectRoot), JSON.stringify({ scope_changes: scopeChanges }, null, 2), "utf-8");
}

export async function addScopeChange(
  projectRoot: string,
  text: string,
  source: "auto-capture" | "manual" = "auto-capture"
): Promise<ScopeChange> {
  const scopeChanges = await readScopeChanges(projectRoot);
  const entry: ScopeChange = {
    id: randomUUID(),
    text,
    capturedAt: new Date().toISOString(),
    source,
  };
  scopeChanges.push(entry);
  await writeScopeChanges(projectRoot, scopeChanges);
  return entry;
}
