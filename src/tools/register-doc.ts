import { addDocument } from "../store/documents.js";
import type { RegisteredDoc } from "../store/documents.js";

export async function registerDocTool(
  projectRoot: string,
  path: string,
  purpose: string,
  relatedFeature?: string
): Promise<RegisteredDoc> {
  return addDocument(projectRoot, path, purpose, relatedFeature);
}
