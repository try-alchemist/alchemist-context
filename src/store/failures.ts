import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

export interface Failure {
  id: string;
  approach: string;
  reason: string;
  topic: string[];
  workaround?: string;
  loggedAt: string;
  source?: string;
}

interface FailuresStore {
  failures: Failure[];
}

function failuresPath(projectRoot: string): string {
  return join(projectRoot, ".alchemist", "failures.json");
}

export async function readFailures(projectRoot: string): Promise<Failure[]> {
  try {
    const raw = await readFile(failuresPath(projectRoot), "utf-8");
    const store = JSON.parse(raw) as FailuresStore;
    return store.failures;
  } catch {
    return [];
  }
}

export async function writeFailures(projectRoot: string, failures: Failure[]): Promise<void> {
  await writeFile(
    failuresPath(projectRoot),
    JSON.stringify({ failures }, null, 2),
    "utf-8"
  );
}

export async function addFailure(
  projectRoot: string,
  approach: string,
  reason: string,
  topic: string[],
  workaround?: string
): Promise<Failure> {
  const failures = await readFailures(projectRoot);
  const entry: Failure = {
    id: randomUUID(),
    approach,
    reason,
    topic,
    workaround,
    loggedAt: new Date().toISOString(),
  };
  failures.push(entry);
  await writeFailures(projectRoot, failures);
  return entry;
}

export function filterFailuresByTopic(failures: Failure[], topic?: string): Failure[] {
  if (!topic) return failures;
  const lower = topic.toLowerCase();
  return failures.filter((f) =>
    f.topic.some((t) => t.toLowerCase().includes(lower))
  );
}
