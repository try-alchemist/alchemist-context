import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { readContext } from "../store/context.js";
import { readDecisions } from "../store/decisions.js";
import { readFailures } from "../store/failures.js";
import { getActiveFeature, listArchivedFeatures } from "../store/features.js";
import { readDocuments, getStaleDocs } from "../store/documents.js";
import type { DocStatus } from "../store/documents.js";
import { getLastCommitHash } from "../sync/git.js";
import { syncContext } from "../sync/sync-context.js";
import { timeAgo } from "../util.js";
import { getActiveGoal } from "../store/goals.js";
import { readConstraints } from "../store/constraints.js";
import { readPreferences } from "../store/preferences.js";
import { readCorrections } from "../store/corrections.js";
import { readProgress } from "../store/progress.js";

export interface SessionBriefing {
  projectName: string;
  lastUpdated: string;
  activeGoal: { text: string; capturedAt: string } | null;
  artifactStatus: {
    specLastUpdated: string | null;
    designLastUpdated: string | null;
    claudemdLastUpdated: string | null;
    planStatus: string | null;
  };
  recentChanges: {
    summary: string;
    commits: { hash: string; message: string; date: string }[];
  };
  knownIssues: { approach: string; reason: string }[];
  recentDecisions: { decision: string; rationale: string; topic: string[] }[];
  recentConstraints: { text: string }[];
  recentPreferences: { text: string }[];
  recentCorrections: { text: string }[];
  recentProgress: { text: string }[];
  contextStats: {
    totalFiles: number;
    lastSyncedCommit: string | null;
    decisionCount: number;
    supersededDecisionCount: number;
    failureCount: number;
    staleWarning?: string;
  };
  activeFeature: { name: string; path: string } | null;
  recentlyArchived: { name: string; completedAt: string; path: string }[];
  documents: {
    total: number;
    active: number;
    stale: { path: string; purpose: string; lastReferencedAt: string }[];
    recent: { path: string; purpose: string; status: DocStatus }[];
  };
  // Phase 4: Superseded decisions detected by contradiction detection
  contradictions: {
    oldDecision: string;
    newDecision: string;
    supersededId: string;
    supersededBy: string;
  }[];
}

async function getFileMtime(path: string): Promise<string | null> {
  try {
    const s = await stat(path);
    return timeAgo(s.mtime);
  } catch {
    return null;
  }
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

export async function getBriefing(projectRoot: string): Promise<SessionBriefing> {
  let ctx = await readContext(projectRoot);

  // Auto-sync if context has no files (e.g. init ran before source code existed)
  if (ctx && ctx.files.length === 0) {
    try {
      ctx = await syncContext(projectRoot);
    } catch {
      // Non-fatal — use stale context
    }
  }

  const allDecisions = await readDecisions(projectRoot);
  // Phase 4: Exclude superseded decisions from the "active" view used for recent lists
  const activeDecisions = allDecisions.filter((d) => d.status !== "superseded");
  const supersededDecisions = allDecisions.filter((d) => d.status === "superseded");
  const failures = await readFailures(projectRoot);
  const lastCommit = await getLastCommitHash(projectRoot);
  const activeGoal = await getActiveGoal(projectRoot);
  const constraints = await readConstraints(projectRoot);
  const preferences = await readPreferences(projectRoot);
  const corrections = await readCorrections(projectRoot);
  const progressEntries = await readProgress(projectRoot);

  const specUpdated = await getFileMtime(join(projectRoot, "SPEC.md"));
  const designUpdated = await getFileMtime(join(projectRoot, "DESIGN.md"));
  const claudeUpdated = await getFileMtime(join(projectRoot, "CLAUDE.md"));

  const planExists = await fileExists(join(projectRoot, "PLAN.md"));
  const planArchived = await fileExists(join(projectRoot, ".alchemist", "archive", "initial-plan.md"));
  const planStatus = planExists ? "active" : planArchived ? "archived" : null;

  const allDocs = await readDocuments(projectRoot);
  const activeDocs = allDocs.filter((d) => d.status === "active" || d.status === "completed");
  const staleDocs = getStaleDocs(allDocs, 30);
  const recentDocs = [...activeDocs]
    .sort((a, b) => new Date(b.lastReferencedAt).getTime() - new Date(a.lastReferencedAt).getTime())
    .slice(0, 5)
    .map((d) => ({ path: d.path, purpose: d.purpose, status: d.status }));

  const activeFeature = await getActiveFeature(projectRoot);
  const allArchived = await listArchivedFeatures(projectRoot);
  const recentlyArchived = allArchived.slice(0, 5).map((a) => ({
    name: a.name,
    completedAt: a.completedAt,
    path: a.path,
  }));

  // Check staleness
  let staleWarning: string | undefined;
  if (ctx) {
    const syncAge = Date.now() - new Date(ctx.generatedAt).getTime();
    if (syncAge > 24 * 60 * 60 * 1000) {
      staleWarning = "Context is >24h old. Run sync_context() to refresh.";
    }
  }

  const recentCommits = (ctx?.recentChanges ?? []).slice(0, 5);

  // Phase 4: decay-weighted ordering for decisions and failures
  const rankedDecisions = await rankByDecay(
    activeDecisions,
    (d) => d.madeAt,
    "decision"
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rankedFailures = await rankByDecay<any>(
    failures,
    (f: any) => f.loggedAt,
    "failure"
  );

  // Build contradictions list from recently superseded decisions
  const contradictions = supersededDecisions
    .filter((d) => d.supersededBy)
    .slice(-5)
    .map((old) => {
      const replacement = allDecisions.find((d) => d.id === old.supersededBy);
      return {
        oldDecision: old.decision,
        newDecision: replacement?.decision ?? "(unknown)",
        supersededId: old.id,
        supersededBy: old.supersededBy ?? "",
      };
    });

  return {
    projectName: ctx?.projectName ?? "Unknown Project",
    lastUpdated: ctx?.generatedAt ?? "never",
    activeGoal: activeGoal ? { text: activeGoal.text, capturedAt: activeGoal.capturedAt } : null,
    artifactStatus: {
      specLastUpdated: specUpdated ?? "never (not yet generated)",
      designLastUpdated: designUpdated,
      claudemdLastUpdated: claudeUpdated,
      planStatus,
    },
    recentChanges: {
      summary: recentCommits.length > 0
        ? `${recentCommits.length} recent commits`
        : "No recent changes",
      commits: recentCommits.map((c) => ({
        hash: c.hash,
        message: c.message,
        date: c.date,
      })),
    },
    knownIssues: rankedFailures.slice(0, 5).map((f: any) => ({
      approach: f.approach,
      reason: f.reason,
    })),
    recentDecisions: rankedDecisions.slice(0, 5).map((d) => ({
      decision: d.decision,
      rationale: d.rationale,
      topic: d.topic,
    })),
    recentConstraints: constraints.slice(-5).map((c) => ({ text: c.text })),
    recentPreferences: preferences.slice(-5).map((p) => ({ text: p.text })),
    recentCorrections: corrections.slice(-5).map((c) => ({ text: c.text })),
    recentProgress: progressEntries.slice(-5).map((p) => ({ text: p.text })),
    contextStats: {
      totalFiles: ctx?.files.length ?? 0,
      lastSyncedCommit: lastCommit,
      decisionCount: activeDecisions.length,
      supersededDecisionCount: supersededDecisions.length,
      failureCount: failures.length,
      staleWarning,
    },
    activeFeature,
    recentlyArchived,
    documents: {
      total: allDocs.length,
      active: activeDocs.length,
      stale: staleDocs.map((d) => ({ path: d.path, purpose: d.purpose, lastReferencedAt: d.lastReferencedAt })),
      recent: recentDocs,
    },
    contradictions,
  };
}

/**
 * Phase 4: Rank entries by decay score (similarity * decayScore for search;
 * decayScore alone for unfiltered listings). Falls back to insertion order
 * when the Pro memory package is not installed.
 */
async function rankByDecay<
  T extends { accessCount?: number; lastAccessedAt?: string }
>(
  entries: T[],
  getCapturedAt: (e: T) => string,
  type: string
): Promise<T[]> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const decayMod: any = await import("@alchemist/pro/memory/decay.js" as any);
    const scored = entries.map((e) => ({
      e,
      score: decayMod.decayScore({
        capturedAt: getCapturedAt(e),
        lastAccessedAt: e.lastAccessedAt,
        accessCount: e.accessCount ?? 0,
        type,
      }),
    }));
    scored.sort((a, b) => b.score - a.score);
    return scored.map((s) => s.e);
  } catch {
    // Preserve insertion order (chronological) when Pro is not active
    return entries.slice().reverse();
  }
}
