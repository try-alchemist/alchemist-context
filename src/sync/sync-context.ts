import { readContext, writeContext, type ProjectContext } from "../store/context.js";
import { scanFiles } from "./scanner.js";
import { getRecentCommits, getLastCommitHash } from "./git.js";
import { detectPatterns } from "./patterns.js";
import { loadConfig, type AlchemistConfig } from "../config.js";

/**
 * Full context sync — scans files, parses imports, detects patterns, writes context.json
 */
export async function syncContext(projectRoot: string): Promise<ProjectContext> {
  const config = await loadConfig(projectRoot);

  const files = await scanFiles(projectRoot, config.ignorePatterns, config.tagRules);
  const patterns = detectPatterns(files);
  const recentChanges = await getRecentCommits(projectRoot, config.maxRecentChanges);
  const lastCommit = await getLastCommitHash(projectRoot);

  // Read existing context to preserve manual data
  const existing = await readContext(projectRoot);

  const ctx: ProjectContext = {
    projectName: config.projectName,
    generatedAt: new Date().toISOString(),
    seedVersion: existing?.seedVersion ?? "1.0.0",
    stack: existing?.stack ?? config.stack ?? {},
    files,
    patterns,
    dependencies: existing?.dependencies ?? [],
    recentChanges,
  };

  await writeContext(projectRoot, ctx);
  return ctx;
}
