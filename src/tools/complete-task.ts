import { addDecision } from "../store/decisions.js";
import { updateArtifactSection } from "../store/artifacts.js";
import { syncContext } from "../sync/sync-context.js";

interface DecisionInput {
  decision: string;
  rationale: string;
  topic: string[];
}

interface ArtifactUpdate {
  section: string;
  content: string;
}

export async function completeTask(
  projectRoot: string,
  summary: string,
  decisions?: DecisionInput[],
  specUpdates?: ArtifactUpdate[],
  designUpdates?: ArtifactUpdate[]
): Promise<string> {
  const results: string[] = [`Task completed: ${summary}`];

  // Log decisions
  if (decisions && decisions.length > 0) {
    for (const d of decisions) {
      const entry = await addDecision(projectRoot, d.decision, d.rationale, d.topic);
      results.push(`  ✓ Decision logged: ${entry.id} — ${d.decision}`);
    }
  }

  // Update SPEC.md sections
  if (specUpdates && specUpdates.length > 0) {
    for (const u of specUpdates) {
      const r = await updateArtifactSection(projectRoot, "spec", u.section, u.content);
      results.push(`  ✓ SPEC.md: ${r.message}`);
    }
  }

  // Update DESIGN.md sections
  if (designUpdates && designUpdates.length > 0) {
    for (const u of designUpdates) {
      const r = await updateArtifactSection(projectRoot, "design", u.section, u.content);
      results.push(`  ✓ DESIGN.md: ${r.message}`);
    }
  }

  // Sync project context
  try {
    const ctx = await syncContext(projectRoot);
    results.push(`  ✓ Context synced: ${ctx.files.length} files`);
  } catch {
    results.push(`  ⚠ Context sync skipped (non-fatal)`);
  }

  return results.join("\n");
}
