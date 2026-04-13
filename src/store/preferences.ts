import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

export interface Preference {
  id: string;
  text: string;
  capturedAt: string;
  source: "auto-capture" | "manual";
}

interface PreferencesStore {
  preferences: Preference[];
}

function preferencesPath(projectRoot: string): string {
  return join(projectRoot, ".alchemist", "preferences.json");
}

export async function readPreferences(projectRoot: string): Promise<Preference[]> {
  try {
    const raw = await readFile(preferencesPath(projectRoot), "utf-8");
    const store = JSON.parse(raw) as PreferencesStore;
    return Array.isArray(store.preferences) ? store.preferences : [];
  } catch {
    return [];
  }
}

export async function writePreferences(projectRoot: string, preferences: Preference[]): Promise<void> {
  await writeFile(preferencesPath(projectRoot), JSON.stringify({ preferences }, null, 2), "utf-8");
}

export async function addPreference(
  projectRoot: string,
  text: string,
  source: "auto-capture" | "manual" = "auto-capture"
): Promise<Preference> {
  const preferences = await readPreferences(projectRoot);
  const entry: Preference = {
    id: randomUUID(),
    text,
    capturedAt: new Date().toISOString(),
    source,
  };
  preferences.push(entry);
  await writePreferences(projectRoot, preferences);
  return entry;
}
