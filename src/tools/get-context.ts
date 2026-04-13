import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { trackAccessBatch } from "../store/access-tracker.js";

export interface ContextResult {
  id: string;
  type: string;
  text: string;
  rationale?: string;
  similarity: number;
  capturedAt: string;
  decayScore: number;
}

interface GetContextOptions {
  query: string;
  types?: string[];
  limit?: number;
}

/**
 * Semantic search across all context stores.
 * Falls back silently to returning [] when the Pro memory package is unavailable.
 */
export async function getContext(
  projectRoot: string,
  options: GetContextOptions
): Promise<ContextResult[]> {
  const { query, types, limit = 10 } = options;

  // Try to dynamically load the Pro memory package.
  // If it's not installed (free tier), return empty results gracefully.
  let embed: any;
  let searchSimilar: any;
  let embeddingsDbExists: any;
  let decayScore: any;
  try {
    const embedMod = await import("@alchemist/pro/memory/embedder.js" as any);
    const vecMod = await import("@alchemist/pro/memory/vector-store.js" as any);
    const decayMod = await import("@alchemist/pro/memory/decay.js" as any);
    embed = embedMod.embed;
    searchSimilar = vecMod.searchSimilar;
    embeddingsDbExists = vecMod.embeddingsDbExists;
    decayScore = decayMod.decayScore;
  } catch {
    return [];
  }

  // Check that embeddings.db exists
  if (!(await embeddingsDbExists(projectRoot))) return [];

  // Embed the query
  const queryEmbedding = await embed(query);
  if (!queryEmbedding) return [];

  // Search across all stores (or filtered by type)
  const storeTypes = types && types.length > 0
    ? types
    : ["decisions", "failures", "goals", "constraints", "preferences", "features"];

  const allHits: Array<{ id: string; store: string; similarity: number }> = [];
  for (const store of storeTypes) {
    try {
      const hits = searchSimilar(projectRoot, queryEmbedding, {
        store,
        limit: limit * 3, // over-fetch so decay re-ranking has room
      });
      allHits.push(...hits);
    } catch {
      // ignore per-store errors
    }
  }

  if (allHits.length === 0) return [];

  // Load entry data for each hit
  const storesNeeded = new Set(allHits.map((h) => h.store));
  const storeData: Record<string, any[]> = {};

  for (const store of storesNeeded) {
    try {
      const raw = await readFile(
        join(projectRoot, ".alchemist", `${store}.json`),
        "utf-8"
      );
      const parsed = JSON.parse(raw);
      let entries: any[] = [];
      if (Array.isArray(parsed)) {
        entries = parsed;
      } else {
        for (const k of Object.keys(parsed)) {
          if (Array.isArray(parsed[k])) {
            entries = parsed[k];
            break;
          }
        }
      }
      storeData[store] = entries;
    } catch {
      storeData[store] = [];
    }
  }

  // Build results
  const results: ContextResult[] = [];
  for (const hit of allHits) {
    const entries = storeData[hit.store] ?? [];
    const entry = entries.find((e: any) => e.id === hit.id);
    if (!entry) continue;

    // Skip superseded decisions
    if (hit.store === "decisions" && entry.status === "superseded") continue;

    const typeSingular = hit.store.replace(/s$/, "");
    const text = getEntryText(hit.store, entry);
    const capturedAt = entry.madeAt ?? entry.loggedAt ?? entry.capturedAt ?? entry.createdAt ?? new Date().toISOString();

    const decay = decayScore({
      capturedAt,
      lastAccessedAt: entry.lastAccessedAt,
      accessCount: entry.accessCount ?? 0,
      type: typeSingular,
    });

    results.push({
      id: hit.id,
      type: typeSingular,
      text,
      rationale: entry.rationale ?? entry.reason,
      similarity: hit.similarity,
      capturedAt,
      decayScore: decay,
    });
  }

  // Re-rank by similarity * decayScore and take top `limit`
  results.sort(
    (a, b) => b.similarity * b.decayScore - a.similarity * a.decayScore
  );
  const top = results.slice(0, limit);

  // Track access for returned results (batch per store)
  const byStore: Record<string, string[]> = {};
  for (const r of top) {
    const store = r.type.endsWith("s") ? r.type : r.type + "s";
    byStore[store] ??= [];
    byStore[store].push(r.id);
  }
  await Promise.all(
    Object.entries(byStore).map(([store, ids]) =>
      trackAccessBatch(projectRoot, store, ids)
    )
  );

  return top;
}

function getEntryText(store: string, entry: any): string {
  switch (store) {
    case "decisions":
      return entry.decision ?? "";
    case "failures":
      return entry.approach ?? "";
    case "goals":
      return entry.goal ?? entry.description ?? "";
    case "constraints":
      return entry.constraint ?? "";
    case "preferences":
      return entry.preference ?? "";
    case "features":
      return entry.name ?? entry.description ?? "";
    default:
      return entry.text ?? entry.name ?? "";
  }
}
