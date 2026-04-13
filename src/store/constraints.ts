import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

export interface Constraint {
  id: string;
  text: string;
  capturedAt: string;
  source: "auto-capture" | "manual";
}

interface ConstraintsStore {
  constraints: Constraint[];
}

function constraintsPath(projectRoot: string): string {
  return join(projectRoot, ".alchemist", "constraints.json");
}

export async function readConstraints(projectRoot: string): Promise<Constraint[]> {
  try {
    const raw = await readFile(constraintsPath(projectRoot), "utf-8");
    const store = JSON.parse(raw) as ConstraintsStore;
    return Array.isArray(store.constraints) ? store.constraints : [];
  } catch {
    return [];
  }
}

export async function writeConstraints(projectRoot: string, constraints: Constraint[]): Promise<void> {
  await writeFile(constraintsPath(projectRoot), JSON.stringify({ constraints }, null, 2), "utf-8");
}

export async function addConstraint(
  projectRoot: string,
  text: string,
  source: "auto-capture" | "manual" = "auto-capture"
): Promise<Constraint> {
  const constraints = await readConstraints(projectRoot);
  const entry: Constraint = {
    id: randomUUID(),
    text,
    capturedAt: new Date().toISOString(),
    source,
  };
  constraints.push(entry);
  await writeConstraints(projectRoot, constraints);
  return entry;
}
