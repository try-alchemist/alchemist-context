import { readFailures, filterFailuresByTopic, type Failure } from "../store/failures.js";
import { trackAccessBatch } from "../store/access-tracker.js";

// Phase 4: Failure store may now carry accessCount/lastAccessedAt fields.
// These are optional — existing entries are treated as count=0 / never-accessed.
type FailureWithAccess = Failure & {
  accessCount?: number;
  lastAccessedAt?: string;
};

/**
 * Get failures, optionally filtered by topic.
 *
 * Phase 4: When Pro memory is active and embeddings.db exists, the topic
 * parameter uses semantic search with decay re-ranking. Otherwise falls back
 * to string matching.
 */
export async function getFailures(
  projectRoot: string,
  topic?: string
): Promise<Failure[]> {
  const all = (await readFailures(projectRoot)) as FailureWithAccess[];

  if (!topic) {
    return decayWeightedOrder(all);
  }

  const semantic = await trySemanticSearch(projectRoot, all, topic);
  if (semantic !== null) {
    await trackAccessBatch(projectRoot, "failures", semantic.map((f) => f.id));
    return semantic;
  }

  return filterFailuresByTopic(all, topic);
}

async function decayWeightedOrder(failures: FailureWithAccess[]): Promise<Failure[]> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const decayMod: any = await import("@alchemist/pro/memory/decay.js" as any);
    const scored = failures.map((f) => ({
      f,
      score: decayMod.decayScore({
        capturedAt: f.loggedAt,
        lastAccessedAt: f.lastAccessedAt,
        accessCount: f.accessCount ?? 0,
        type: "failure",
      }),
    }));
    scored.sort((a, b) => b.score - a.score);
    return scored.map((s) => s.f);
  } catch {
    return failures;
  }
}

async function trySemanticSearch(
  projectRoot: string,
  failures: FailureWithAccess[],
  topic: string
): Promise<Failure[] | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const embedMod: any = await import("@alchemist/pro/memory/embedder.js" as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vecMod: any = await import("@alchemist/pro/memory/vector-store.js" as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const decayMod: any = await import("@alchemist/pro/memory/decay.js" as any);

    if (!(await vecMod.embeddingsDbExists(projectRoot))) return null;

    const vec = await embedMod.embed(topic);
    if (!vec) return null;

    const hits: Array<{ id: string; store: string; similarity: number }> =
      vecMod.searchSimilar(projectRoot, vec, { store: "failures", limit: 30 });

    if (hits.length === 0) return [];

    const ranked: Array<{ f: FailureWithAccess; score: number }> = [];
    for (const hit of hits) {
      const f = failures.find((x) => x.id === hit.id);
      if (!f) continue;
      const decay: number = decayMod.decayScore({
        capturedAt: f.loggedAt,
        lastAccessedAt: f.lastAccessedAt,
        accessCount: f.accessCount ?? 0,
        type: "failure",
      });
      ranked.push({ f, score: hit.similarity * decay });
    }
    ranked.sort((a, b) => b.score - a.score);
    return ranked.map((r) => r.f);
  } catch {
    return null;
  }
}
