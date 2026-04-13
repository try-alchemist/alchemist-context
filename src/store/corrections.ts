import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

export interface Correction {
  id: string;
  text: string;
  capturedAt: string;
  source: "auto-capture" | "manual";
}

interface CorrectionsStore {
  corrections: Correction[];
}

function correctionsPath(projectRoot: string): string {
  return join(projectRoot, ".alchemist", "corrections.json");
}

export async function readCorrections(projectRoot: string): Promise<Correction[]> {
  try {
    const raw = await readFile(correctionsPath(projectRoot), "utf-8");
    const store = JSON.parse(raw) as CorrectionsStore;
    return Array.isArray(store.corrections) ? store.corrections : [];
  } catch {
    return [];
  }
}

export async function writeCorrections(projectRoot: string, corrections: Correction[]): Promise<void> {
  await writeFile(correctionsPath(projectRoot), JSON.stringify({ corrections }, null, 2), "utf-8");
}

export async function addCorrection(
  projectRoot: string,
  text: string,
  source: "auto-capture" | "manual" = "auto-capture"
): Promise<Correction> {
  const corrections = await readCorrections(projectRoot);
  const entry: Correction = {
    id: randomUUID(),
    text,
    capturedAt: new Date().toISOString(),
    source,
  };
  corrections.push(entry);
  await writeCorrections(projectRoot, corrections);
  return entry;
}
