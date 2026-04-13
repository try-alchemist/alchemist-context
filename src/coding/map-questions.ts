import type { CodingQuestion } from "./session.js";

/**
 * Maps CodingQuestion[] into instruction text telling Claude to call AskUserQuestion.
 * Max 4 options per question (AskUserQuestion limit).
 */
export function mapQuestionsToAskUser(
  questions: CodingQuestion[],
  nextToolCall: string
): string {
  const lines: string[] = [];
  lines.push("Present the following questions to the user using AskUserQuestion.\n");
  lines.push("Call AskUserQuestion with the following questions:\n");

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    lines.push(`Question ${i + 1}:`);
    lines.push(`  question: "${q.label}"`);

    // Generate a short header (max 12 chars) from the question label
    const header = q.label.split(/\s+/).slice(0, 2).join(" ").slice(0, 12);
    lines.push(`  header: "${header}"`);

    if (q.type === "free_text") {
      lines.push(`  freeform: true`);
    } else {
      lines.push(`  multiSelect: ${q.type === "multi_select"}`);
      if (q.options && q.options.length > 0) {
        lines.push(`  options:`);
        // Cap at 4 options (AskUserQuestion limit)
        const capped = q.options.slice(0, 4);
        for (const opt of capped) {
          lines.push(`    - label: "${opt.label}"`);
          if (opt.description) {
            lines.push(`      description: "${opt.description}"`);
          }
        }
      }
    }
    lines.push("");
  }

  lines.push(`After collecting all answers, call ${nextToolCall}.`);

  return lines.join("\n");
}
