import { addDecision, type Decision } from "../store/decisions.js";

export async function logDecision(
  projectRoot: string,
  decision: string,
  rationale: string,
  topic: string[]
): Promise<Decision> {
  return addDecision(projectRoot, decision, rationale, topic);
}
