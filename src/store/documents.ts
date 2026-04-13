import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

export type DocStatus = "active" | "completed" | "superseded" | "archived";

export interface RegisteredDoc {
  id: string;
  path: string;
  purpose: string;
  status: DocStatus;
  relatedFeature?: string;
  createdAt: string;
  lastReferencedAt: string;
  archiveReason?: string;
}

interface DocumentsStore {
  documents: RegisteredDoc[];
}

function documentsPath(projectRoot: string): string {
  return join(projectRoot, ".alchemist", "documents.json");
}

export async function readDocuments(projectRoot: string): Promise<RegisteredDoc[]> {
  try {
    const raw = await readFile(documentsPath(projectRoot), "utf-8");
    const store = JSON.parse(raw) as DocumentsStore;
    return store.documents;
  } catch {
    return [];
  }
}

export async function writeDocuments(projectRoot: string, docs: RegisteredDoc[]): Promise<void> {
  await writeFile(
    documentsPath(projectRoot),
    JSON.stringify({ documents: docs }, null, 2),
    "utf-8"
  );
}

function normalizePath(p: string): string {
  return p.startsWith("./") ? p.slice(2) : p;
}

export async function addDocument(
  projectRoot: string,
  path: string,
  purpose: string,
  relatedFeature?: string
): Promise<RegisteredDoc> {
  const normalizedPath = normalizePath(path);
  const docs = await readDocuments(projectRoot);
  const existing = docs.find((d) => d.path === normalizedPath);

  if (existing) {
    existing.purpose = purpose;
    if (relatedFeature !== undefined) existing.relatedFeature = relatedFeature;
    existing.lastReferencedAt = new Date().toISOString();
    await writeDocuments(projectRoot, docs);
    return existing;
  }

  const entry: RegisteredDoc = {
    id: randomUUID(),
    path: normalizedPath,
    purpose,
    status: "active",
    relatedFeature,
    createdAt: new Date().toISOString(),
    lastReferencedAt: new Date().toISOString(),
  };
  docs.push(entry);
  await writeDocuments(projectRoot, docs);
  return entry;
}

export async function findDocuments(projectRoot: string, query: string): Promise<RegisteredDoc[]> {
  const docs = await readDocuments(projectRoot);
  const lower = query.trim().toLowerCase();

  let matches: RegisteredDoc[];

  if (!lower) {
    matches = docs.filter((d) => d.status === "active");
  } else {
    const allMatches = docs.filter((d) =>
      d.path.toLowerCase().includes(lower) ||
      d.purpose.toLowerCase().includes(lower) ||
      (d.relatedFeature?.toLowerCase().includes(lower) ?? false)
    );

    const activeMatches = allMatches.filter((d) => d.status !== "archived");
    matches = activeMatches.length > 0 ? activeMatches : allMatches;
  }

  const statusOrder: Record<DocStatus, number> = { active: 0, completed: 1, superseded: 2, archived: 3 };
  matches.sort((a, b) => statusOrder[a.status] - statusOrder[b.status]);

  if (matches.length > 0) {
    const matchedPaths = new Set(matches.map((d) => d.path));
    const now = new Date().toISOString();
    for (const doc of docs) {
      if (matchedPaths.has(doc.path)) {
        doc.lastReferencedAt = now;
      }
    }
    await writeDocuments(projectRoot, docs);
  }

  return matches;
}

export async function archiveDocument(
  projectRoot: string,
  path: string,
  reason: string
): Promise<RegisteredDoc | null> {
  const normalizedPath = normalizePath(path);
  const docs = await readDocuments(projectRoot);
  const doc = docs.find((d) => d.path === normalizedPath);

  if (!doc) return null;

  doc.status = "archived";
  doc.archiveReason = reason;
  await writeDocuments(projectRoot, docs);
  return doc;
}

export async function touchDocument(projectRoot: string, path: string): Promise<void> {
  try {
    const normalizedPath = normalizePath(path);
    const docs = await readDocuments(projectRoot);
    const doc = docs.find((d) => d.path === normalizedPath);
    if (!doc) return;
    doc.lastReferencedAt = new Date().toISOString();
    await writeDocuments(projectRoot, docs);
  } catch {
    // Silent no-op
  }
}

export function isStale(doc: RegisteredDoc, thresholdDays = 30): boolean {
  const last = new Date(doc.lastReferencedAt).getTime();
  const now = Date.now();
  return (now - last) / (1000 * 60 * 60 * 24) > thresholdDays;
}

export function getStaleDocs(docs: RegisteredDoc[], thresholdDays = 30): RegisteredDoc[] {
  return docs.filter((d) => d.status === "active" && isStale(d, thresholdDays));
}
