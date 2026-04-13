import { syncContext } from "../sync/sync-context.js";

export async function syncContextTool(
  projectRoot: string
): Promise<{ synced: boolean; fileCount: number; message: string }> {
  const ctx = await syncContext(projectRoot);
  return {
    synced: true,
    fileCount: ctx.files.length,
    message: `Context synced: ${ctx.files.length} files, ${ctx.patterns.length} patterns detected, ${ctx.recentChanges.length} recent commits`,
  };
}
