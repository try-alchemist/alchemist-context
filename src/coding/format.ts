import type { CodingSession } from "./session.js";

/** Format session state into a readable project brief for the LLM */
export function formatProjectBrief(session: CodingSession): string {
  const lines: string[] = [];

  lines.push("=== PROJECT BRIEF ===\n");

  if (session.ideaDump) {
    lines.push(`## User's Idea\n${session.ideaDump}\n`);
  }

  if (session.extraction) {
    const e = session.extraction;
    lines.push(`## Project Analysis`);
    if (e.intent) lines.push(`- Intent: ${e.intent}`);
    if (e.projectType) lines.push(`- Type: ${e.projectType}`);
    if (e.complexity) lines.push(`- Complexity: ${e.complexity}`);
    if (e.profile) lines.push(`- Profile: ${e.profile}`);
    if (e.platform && e.platform !== "unknown") lines.push(`- Platform: ${e.platform}`);
    if (e.audience && e.audience !== "unknown") lines.push(`- Audience: ${e.audience}`);
    if (e.hasUI !== undefined) lines.push(`- Has UI: ${e.hasUI ? "Yes" : "No"}`);
    if (e.entities?.length) lines.push(`- Key concepts: ${e.entities.join(", ")}`);
    lines.push("");
  }

  if (session.clarificationAnswers?.length) {
    lines.push(`## User's Decisions`);
    for (const c of session.clarificationAnswers) {
      if (c.answer) lines.push(`- ${c.question}: ${c.answer}`);
    }
    lines.push("");
  }

  if (session.stack && Object.keys(session.stack).length > 0) {
    lines.push(`## Tech Stack`);
    for (const [category, choice] of Object.entries(session.stack)) {
      if (choice && choice !== "not_sure") {
        lines.push(`- ${category}: ${choice}`);
      }
    }
    lines.push("");
  }

  if (session.uiAnswers?.length) {
    lines.push(`## UI / Design Decisions`);
    for (const a of session.uiAnswers) {
      if (a.answer) lines.push(`- ${a.question}: ${a.answer}`);
    }
    lines.push("");
  }

  lines.push("=== END PROJECT BRIEF ===");
  return lines.join("\n");
}
