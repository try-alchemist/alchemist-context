import { archiveDocument } from "../store/documents.js";
import type { RegisteredDoc } from "../store/documents.js";

export async function archiveDocTool(
  projectRoot: string,
  path: string,
  reason: string
): Promise<{ success: boolean; doc: RegisteredDoc | null }> {
  const doc = await archiveDocument(projectRoot, path, reason);
  return { success: doc !== null, doc };
}
