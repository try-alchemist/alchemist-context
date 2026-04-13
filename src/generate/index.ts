import { readCodebase } from "./codebase-reader.js";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { injectClaudeMdLivingContext } from "../init/claude-md-template.js";

const API_BASE = process.env.ALCHEMIST_API_URL ?? "https://api.try-alchemist.com";

interface GenerateResponse {
  spec: string;
  design?: string;
  claudeAdditions?: string;
}

export async function generate(projectRoot: string, authToken: string): Promise<void> {
  console.log("Scanning project...\n");

  const summary = await readCodebase(projectRoot);
  console.log(`  Found ${summary.fileCount} files`);
  console.log(`  Stack: ${Object.entries(summary.stack).map(([k, v]) => `${k}=${v}`).join(", ")}`);
  console.log(`  Has UI: ${summary.hasUI}\n`);

  console.log("Generating context documents (this may take a moment)...\n");

  const response = await fetch(`${API_BASE}/context/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify({
      projectSummary: JSON.stringify(summary.files),
      stack: summary.stack,
      hasUI: summary.hasUI,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    if (response.status === 403) {
      throw new Error("This feature requires a Pro subscription. Upgrade at https://try-alchemist.com");
    }
    throw new Error(`Failed to generate: ${response.status} — ${body}`);
  }

  const data = (await response.json()) as GenerateResponse;

  // Write SPEC.md
  await writeFile(join(projectRoot, "SPEC.md"), data.spec, "utf-8");
  console.log("  Wrote SPEC.md");

  // Write DESIGN.md (only if UI)
  if (data.design) {
    await writeFile(join(projectRoot, "DESIGN.md"), data.design, "utf-8");
    console.log("  Wrote DESIGN.md");
  }

  // Inject Living Context into CLAUDE.md
  await injectClaudeMdLivingContext(projectRoot);

  console.log(`
\x1b[32m✅ Context documents generated\x1b[0m

  Files written:
    SPEC.md          — What this project does (review and correct if needed)${data.design ? "\n    DESIGN.md        — UI patterns & components (review and correct if needed)" : ""}
    CLAUDE.md        — Updated with project-specific conventions

  These are starting points. Edit them to fix anything the AI got wrong.
  They'll be kept current automatically as you work.
`);
}
