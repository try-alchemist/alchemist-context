import { readDecisions, filterDecisionsByTopic, type Decision } from "../store/decisions.js";
import { trackAccessBatch } from "../store/access-tracker.js";

/**
 * Get decisions, optionally filtered by topic.
 *
 * Phase 4: When the Pro memory package is active and embeddings.db exists,
 * the topic parameter uses semantic search + decay re-ranking. Otherwise
 * falls back to the existing string-match filter.
 *
 * Superseded decisions are excluded by default.
 */
export async function getDecisions(
  projectRoot: string,
  topic?: string
): Promise<Decision[]> {
  const all = await readDecisions(projectRoot);

  // Exclude superseded decisions from normal retrieval
  const active = all.filter((d) => d.status !== "superseded");

  if (!topic) {
    // No topic filter — return active decisions in decay-weighted order if Pro is on
    return decayWeightedOrder(active);
  }

  // Try semantic search (Pro memory)
  const semantic = await trySemanticSearch(projectRoot, active, topic);
  if (semantic !== null) {
    await trackAccessBatch(projectRoot, "decisions", semantic.map((d) => d.id));
    return semantic;
  }

  // Fallback: existing string-match filter
  return filterDecisionsByTopic(active, topic);
}

async function decayWeightedOrder(decisions: Decision[]): Promise<Decision[]> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const decayMod: any = await import("@alchemist/pro/memory/decay.js" as any);
    const scored = decisions.map((d) => ({
      d,
      score: decayMod.decayScore({
        capturedAt: d.madeAt,
        lastAccessedAt: d.lastAccessedAt,
        accessCount: d.accessCount ?? 0,
        type: "decision",
      }),
    }));
    scored.sort((a, b) => b.score - a.score);
    return scored.map((s) => s.d);
  } catch {
    // Pro not installed — preserve insertion order
    return decisions;
  }
}

async function trySemanticSearch(
  projectRoot: string,
  decisions: Decision[],
  topic: string
): Promise<Decision[] | null> {
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
      vecMod.searchSimilar(projectRoot, vec, { store: "decisions", limit: 30 });

    if (hits.length === 0) return [];

    // Map hits to decisions, re-rank by similarity * decayScore
    const ranked: Array<{ d: Decision; score: number }> = [];
    for (const hit of hits) {
      const d = decisions.find((x) => x.id === hit.id);
      if (!d) continue;
      const decay: number = decayMod.decayScore({
        capturedAt: d.madeAt,
        lastAccessedAt: d.lastAccessedAt,
        accessCount: d.accessCount ?? 0,
        type: "decision",
      });
      ranked.push({ d, score: hit.similarity * decay });
    }
    ranked.sort((a, b) => b.score - a.score);
    return ranked.map((r) => r.d);
  } catch {
    return null;
  }
}
