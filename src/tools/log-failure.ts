import { addFailure, type Failure } from "../store/failures.js";

export async function logFailure(
  projectRoot: string,
  approach: string,
  reason: string,
  topic: string[],
  workaround?: string
): Promise<Failure> {
  return addFailure(projectRoot, approach, reason, topic, workaround);
}
