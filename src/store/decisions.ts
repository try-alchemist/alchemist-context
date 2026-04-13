import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

export interface Decision {
  id: string;
  decision: string;
  rationale: string;
  topic: string[];
  madeAt: string;
  supersedes?: string;
  source?: string;
  // Phase 4: Smart Memory fields (all optional — existing entries default gracefully)
  status?: "active" | "superseded";
  supersededBy?: string;    // ID of newer decision that replaced this one
  supersedesId?: string;    // ID of older decision this replaced
  accessCount?: number;     // defaults to 0 when missing
  lastAccessedAt?: string;
}

interface DecisionsStore {
  decisions: Decision[];
}

function decisionsPath(projectRoot: string): string {
  return join(projectRoot, ".alchemist", "decisions.json");
}

export async function readDecisions(projectRoot: string): Promise<Decision[]> {
  try {
    const raw = await readFile(decisionsPath(projectRoot), "utf-8");
    const store = JSON.parse(raw) as DecisionsStore;
    return store.decisions;
  } catch {
    return [];
  }
}

export async function writeDecisions(projectRoot: string, decisions: Decision[]): Promise<void> {
  await writeFile(
    decisionsPath(projectRoot),
    JSON.stringify({ decisions }, null, 2),
    "utf-8"
  );
}

export async function addDecision(
  projectRoot: string,
  decision: string,
  rationale: string,
  topic: string[]
): Promise<Decision> {
  const decisions = await readDecisions(projectRoot);
  const entry: Decision = {
    id: randomUUID(),
    decision,
    rationale,
    topic,
    madeAt: new Date().toISOString(),
    source: "claude-session",
    status: "active",
    accessCount: 0,
  };

  // Phase 4: Contradiction detection (Pro Smart Memory)
  // Attempts to load the pro memory package dynamically. Falls back silently
  // when Pro is not installed or embeddings.db does not exist.
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vecMod: any = await import("@alchemist/pro/memory/vector-store.js" as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const embedMod: any = await import("@alchemist/pro/memory/embedder.js" as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const contradictionMod: any = await import("@alchemist/pro/memory/contradiction.js" as any);

    if (await vecMod.embeddingsDbExists(projectRoot)) {
      const vec = await embedMod.embed(entry.decision);
      if (vec) {
        // Insert the new decision's embedding so future contradiction checks find it
        vecMod.insertEmbedding(projectRoot, entry.id, "decisions", vec);

        const activeExisting = decisions.filter((d) => d.status !== "superseded");
        const supersededId: string | null = await contradictionMod.detectContradictionWithDecisions(
          projectRoot,
          entry,
          activeExisting
        );

        if (supersededId) {
          const old = decisions.find((d) => d.id === supersededId);
          if (old) {
            old.status = "superseded";
            old.supersededBy = entry.id;
            entry.supersedesId = old.id;
          }
        }
      }
    }
  } catch {
    // Pro memory package not installed — contradiction detection silently disabled
  }

  decisions.push(entry);
  await writeDecisions(projectRoot, decisions);
  return entry;
}

export function filterDecisionsByTopic(decisions: Decision[], topic?: string): Decision[] {
  if (!topic) return decisions;
  const lower = topic.toLowerCase();
  return decisions.filter((d) =>
    d.topic.some((t) => t.toLowerCase().includes(lower))
  );
}
