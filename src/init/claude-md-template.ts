import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const LIVING_CONTEXT_SECTION = `
## Living Context (Alchemist) — MANDATORY

You MUST use the \`alchemist-context\` MCP tools. They are your primary interface for understanding this project.

### START of every session (before reading files)
Call these 4 tools in order: \`get_briefing()\` → \`get_project_map(scope)\` → \`get_decisions()\` → \`get_failures()\`

### When the user asks you to add or change a feature
Call \`plan_feature()\` BEFORE reading any implementation files or writing any code. Do not skip this based on perceived scope — call it first, every time.
1. Call \`plan_feature(name, description)\`
2. Fill in every [REQUIRED] section in the spec, then save it to the file path the tool returns
3. If "Open Questions" has anything other than "None", ask the user before continuing
4. Present the full spec (every section, no summarizing) and wait for explicit approval
5. Run \`/compact\` after approval — the spec file persists through compaction
6. Then implement

### AFTER completing any task
- Feature work: call \`complete_feature(name, testResults, ...)\` immediately after automated tests pass — do not wait for user manual testing
- Small changes: call \`complete_task(summary, ...)\` immediately after the code change — do not wait for user feedback or confirmation
- If an approach fails: call \`log_failure()\` BEFORE trying the next approach

### When creating or discovering markdown documents
- After writing any .md file outside of .alchemist/: call \`register_doc(path, purpose)\`
- Before creating a new .md file: call \`find_docs(topic)\` to check if one already exists
- When the user references a doc vaguely ("that spec we wrote", "the architecture doc"): call \`find_docs(query)\` first

### Rules
- NEVER skip the session start tools — they prevent wasted tokens and repeated mistakes
- NEVER skip logging after a task — future sessions depend on this context being current
- Prefer \`get_project_map(scope)\` over reading 5+ files directly
`;

const MARKER = "## Living Context (Alchemist)";

/**
 * Inject the Living Context instructions into CLAUDE.md.
 * If CLAUDE.md exists, append (unless already present).
 * If not, create a minimal one.
 */
export async function injectClaudeMdLivingContext(projectRoot: string): Promise<void> {
  const claudePath = join(projectRoot, "CLAUDE.md");
  let existing: string;

  try {
    existing = await readFile(claudePath, "utf-8");
  } catch {
    // No CLAUDE.md — create one with just the Living Context section
    await writeFile(claudePath, LIVING_CONTEXT_SECTION.trim() + "\n", "utf-8");
    console.log("  Created CLAUDE.md with Living Context instructions");
    return;
  }

  // Already has Living Context section — skip
  if (existing.includes(MARKER)) {
    return;
  }

  // Append
  const updated = existing.trimEnd() + "\n" + LIVING_CONTEXT_SECTION;
  await writeFile(claudePath, updated, "utf-8");
  console.log("  Added Living Context section to CLAUDE.md");
}
