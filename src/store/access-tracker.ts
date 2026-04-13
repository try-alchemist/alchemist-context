import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Update accessCount and lastAccessedAt for a specific entry in a store.
 * Silently fails if the store or entry doesn't exist.
 *
 * @param projectRoot - Project root directory
 * @param store - Store name (e.g. "decisions", "failures")
 * @param id - Entry ID
 */
export async function trackAccess(
  projectRoot: string,
  store: string,
  id: string
): Promise<void> {
  const path = join(projectRoot, ".alchemist", `${store}.json`);
  try {
    const raw = await readFile(path, "utf-8");
    const data = JSON.parse(raw);

    // Find the array of entries (could be under any key)
    let entries: any[] | null = null;
    let key: string | null = null;

    if (Array.isArray(data)) {
      entries = data;
    } else {
      for (const k of Object.keys(data)) {
        if (Array.isArray(data[k])) {
          entries = data[k];
          key = k;
          break;
        }
      }
    }

    if (!entries) return;

    const entry = entries.find((e: any) => e.id === id);
    if (!entry) return;

    entry.accessCount = (entry.accessCount ?? 0) + 1;
    entry.lastAccessedAt = new Date().toISOString();

    await writeFile(path, JSON.stringify(data, null, 2), "utf-8");
  } catch {
    // Silently ignore — access tracking is advisory
  }
}

/**
 * Track access for multiple entries in the same store at once.
 * More efficient than calling trackAccess repeatedly.
 */
export async function trackAccessBatch(
  projectRoot: string,
  store: string,
  ids: string[]
): Promise<void> {
  if (ids.length === 0) return;

  const path = join(projectRoot, ".alchemist", `${store}.json`);
  try {
    const raw = await readFile(path, "utf-8");
    const data = JSON.parse(raw);

    let entries: any[] | null = null;
    if (Array.isArray(data)) {
      entries = data;
    } else {
      for (const k of Object.keys(data)) {
        if (Array.isArray(data[k])) {
          entries = data[k];
          break;
        }
      }
    }

    if (!entries) return;

    const idSet = new Set(ids);
    const now = new Date().toISOString();
    let changed = false;

    for (const entry of entries) {
      if (idSet.has(entry.id)) {
        entry.accessCount = (entry.accessCount ?? 0) + 1;
        entry.lastAccessedAt = now;
        changed = true;
      }
    }

    if (changed) {
      await writeFile(path, JSON.stringify(data, null, 2), "utf-8");
    }
  } catch {
    // Silently ignore
  }
}
