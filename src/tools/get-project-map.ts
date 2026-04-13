import { readContext, type FileEntry, type Pattern } from "../store/context.js";
import { findRelatedArchived } from "../store/features.js";
import { syncContext } from "../sync/sync-context.js";

export interface ProjectMapResult {
  totalFiles: number;
  files: FileEntry[];
  patterns: Pattern[];
  scope?: string;
  relatedFeatures: { name: string; completedAt: string; path: string }[];
}

export async function getProjectMap(
  projectRoot: string,
  scope?: string
): Promise<ProjectMapResult> {
  let ctx = await readContext(projectRoot);

  // Auto-sync if context has no files (e.g. init ran before source code existed)
  if (ctx && ctx.files.length === 0) {
    try {
      ctx = await syncContext(projectRoot);
    } catch {
      // Non-fatal
    }
  }

  if (!ctx) {
    return { totalFiles: 0, files: [], patterns: [], scope, relatedFeatures: [] };
  }

  let files = ctx.files;
  let patterns = ctx.patterns;

  if (scope) {
    const lower = scope.toLowerCase();
    files = files.filter((f) =>
      f.tags.some((t) => t.toLowerCase().includes(lower))
    );
    patterns = patterns.filter((p) =>
      p.name.toLowerCase().includes(lower) ||
      p.files.some((f) => f.toLowerCase().includes(lower))
    );
  }

  const relatedFeatures = scope
    ? (await findRelatedArchived(projectRoot, scope)).map((a) => ({
        name: a.name,
        completedAt: a.completedAt,
        path: a.path,
      }))
    : [];

  return {
    totalFiles: files.length,
    files,
    patterns,
    scope,
    relatedFeatures,
  };
}
