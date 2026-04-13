import { readFile, writeFile, rename, unlink, mkdir } from "node:fs/promises";
import { join } from "node:path";

function planPath(projectRoot: string): string {
  return join(projectRoot, "PLAN.md");
}

function archivePath(projectRoot: string): string {
  return join(projectRoot, ".alchemist", "archive", "initial-plan.md");
}

export async function readPlan(projectRoot: string): Promise<string | null> {
  try {
    return await readFile(planPath(projectRoot), "utf-8");
  } catch {
    return null;
  }
}

/**
 * Check off items in PLAN.md that match the given labels.
 * Matches `- [ ] <text>` lines where <text> starts with or contains the label.
 * Returns { updated: boolean, content: string, allComplete: boolean }.
 */
export async function checkOffPlanItems(
  projectRoot: string,
  items: string[]
): Promise<{ updated: boolean; checkedCount: number; allComplete: boolean }> {
  const content = await readPlan(projectRoot);
  if (!content) return { updated: false, checkedCount: 0, allComplete: false };

  let checkedCount = 0;
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const uncheckedMatch = line.match(/^(\s*- )\[ \] (.+)$/);
    if (!uncheckedMatch) continue;

    const itemText = uncheckedMatch[2].trim().toLowerCase();
    const matched = items.some((label) => {
      const lower = label.toLowerCase();
      // Match if the plan item starts with the label, or contains it as a substring
      return itemText.startsWith(lower) || itemText.includes(lower) || lower.includes(itemText);
    });

    if (matched) {
      lines[i] = `${uncheckedMatch[1]}[x] ${uncheckedMatch[2]}`;
      checkedCount++;
    }
  }

  const updated = checkedCount > 0;
  const newContent = lines.join("\n");

  if (updated) {
    await writeFile(planPath(projectRoot), newContent, "utf-8");
  }

  // Check if ALL checkboxes are now complete
  const allComplete = !newContent.match(/^(\s*- )\[ \] /m);

  return { updated, checkedCount, allComplete };
}

/**
 * Archive PLAN.md to .alchemist/archive/initial-plan.md and delete the original.
 */
export async function archivePlan(projectRoot: string): Promise<string> {
  const dest = archivePath(projectRoot);
  await mkdir(join(projectRoot, ".alchemist", "archive"), { recursive: true });
  await rename(planPath(projectRoot), dest);
  return ".alchemist/archive/initial-plan.md";
}
