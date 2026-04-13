import { findDocuments } from "../store/documents.js";
import type { RegisteredDoc } from "../store/documents.js";

export async function findDocsTool(
  projectRoot: string,
  query: string
): Promise<{ docs: RegisteredDoc[]; count: number }> {
  const docs = await findDocuments(projectRoot, query);
  return { docs, count: docs.length };
}
