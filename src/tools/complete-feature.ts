import { readActiveFeature, archiveFeature, writeActiveFeature } from "../store/features.js";
import { addDecision } from "../store/decisions.js";
import { updateArtifactSection } from "../store/artifacts.js";
import { syncContext } from "../sync/sync-context.js";
import { checkOffPlanItems, archivePlan } from "../store/plan.js";

interface TestResult {
  item: string;
  passed: boolean;
  notes?: string;
}

interface DecisionInput {
  decision: string;
  rationale: string;
  topic: string[];
}

interface ArtifactUpdate {
  section: string;
  content: string;
}

export async function completeFeature(
  projectRoot: string,
  name: string,
  testResults: TestResult[],
  decisions?: DecisionInput[],
  specUpdates?: ArtifactUpdate[],
  designUpdates?: ArtifactUpdate[]
): Promise<string> {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  // Read the active feature spec
  const specContent = await readActiveFeature(projectRoot, slug);
  if (!specContent) {
    return `Error: No active feature spec found for "${name}" (looked for .alchemist/features/active/${slug}.md). Did you call plan_feature() first?`;
  }

  const results: string[] = [`Feature completed: ${name}`];

  // Validate test results
  const passed = testResults.filter((r) => r.passed).length;
  const failed = testResults.filter((r) => !r.passed);
  results.push(`\nTest results: ${passed}/${testResults.length} passed`);

  if (failed.length > 0) {
    results.push("  Failures:");
    for (const f of failed) {
      results.push(`  ✗ ${f.item}${f.notes ? ` — ${f.notes}` : ""}`);
    }
  }

  // Append results section to spec before archiving
  const resultsSection = buildResultsSection(testResults, decisions ?? []);
  const updatedSpec = specContent.trimEnd() + "\n\n" + resultsSection;
  await writeActiveFeature(projectRoot, slug, updatedSpec);

  // Log decisions
  if (decisions && decisions.length > 0) {
    for (const d of decisions) {
      const entry = await addDecision(projectRoot, d.decision, d.rationale, d.topic);
      results.push(`  ✓ Decision logged: ${entry.id.slice(0, 8)} — ${d.decision}`);
    }
  }

  // Update SPEC.md
  if (specUpdates && specUpdates.length > 0) {
    for (const u of specUpdates) {
      const r = await updateArtifactSection(projectRoot, "spec", u.section, u.content);
      results.push(`  ✓ SPEC.md: ${r.message}`);
    }
  }

  // Update DESIGN.md
  if (designUpdates && designUpdates.length > 0) {
    for (const u of designUpdates) {
      const r = await updateArtifactSection(projectRoot, "design", u.section, u.content);
      results.push(`  ✓ DESIGN.md: ${r.message}`);
    }
  }

  // Sync context
  try {
    const ctx = await syncContext(projectRoot);
    results.push(`  ✓ Context synced: ${ctx.files.length} files`);
  } catch {
    results.push(`  ⚠ Context sync skipped (non-fatal)`);
  }

  // Check off matching items in PLAN.md
  const planLabels = [
    ...testResults.filter((r) => r.passed).map((r) => r.item),
    name,
    slug,
  ];
  try {
    const planResult = await checkOffPlanItems(projectRoot, planLabels);
    if (planResult.checkedCount > 0) {
      results.push(`  ✓ PLAN.md: checked off ${planResult.checkedCount} item(s)`);
    }
    if (planResult.allComplete) {
      const archPath = await archivePlan(projectRoot);
      results.push(`  ✓ All PLAN.md items complete — archived to ${archPath} and deleted PLAN.md`);
    }
  } catch {
    // PLAN.md may not exist — non-fatal
  }

  // Archive the feature spec
  const featureArchivePath = await archiveFeature(projectRoot, slug);
  results.push(`  ✓ Feature archived: ${featureArchivePath}`);

  results.push(
    `\n→ Feature spec archived. Future sessions can reference it via get_project_map() with a relevant scope.`
  );

  if (failed.length > 0) {
    results.push(
      `\n⚠ ${failed.length} test(s) did not pass. Review failures above before marking this feature as complete.`
    );
  }

  return results.join("\n");
}

function extractManualVerification(specContent: string): string[] {
  const match = specContent.match(/## Manual Verification\n([\s\S]*?)(?=\n## |\n---|\n*$)/);
  if (!match) return [];
  return match[1]
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("- [ ]") || l.startsWith("- [x]") || l.startsWith("- [X]"))
    .filter((l) => !l.toLowerCase().includes("none"));
}

function buildResultsSection(testResults: TestResult[], decisions: DecisionInput[]): string {
  const date = new Date().toISOString().split("T")[0];
  const lines = [`## Results\nCompleted: ${date}\n`];

  lines.push("### Test Results");
  for (const r of testResults) {
    const icon = r.passed ? "✓" : "✗";
    lines.push(`- [${icon}] ${r.item}${r.notes ? ` — ${r.notes}` : ""}`);
  }

  if (decisions.length > 0) {
    lines.push("\n### Decisions Made");
    for (const d of decisions) {
      lines.push(`- **${d.decision}** — ${d.rationale}`);
    }
  }

  return lines.join("\n");
}
