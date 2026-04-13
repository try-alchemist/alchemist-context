import { readFile, writeFile, mkdir, readdir, rename, stat } from "node:fs/promises";
import { join } from "node:path";

export interface FeatureSpec {
  name: string;
  description: string;
  content: string;
  createdAt: string;
}

export interface ArchivedFeature {
  name: string;
  filename: string;
  path: string;
  completedAt: string;
}

function featuresDir(projectRoot: string): string {
  return join(projectRoot, ".alchemist", "features");
}

function activeDir(projectRoot: string): string {
  return join(featuresDir(projectRoot), "active");
}

function archiveDir(projectRoot: string): string {
  return join(featuresDir(projectRoot), "archive");
}

function activeFeaturePath(projectRoot: string, name: string): string {
  return join(activeDir(projectRoot), `${name}.md`);
}

export async function readActiveFeature(projectRoot: string, name: string): Promise<string | null> {
  try {
    return await readFile(activeFeaturePath(projectRoot, name), "utf-8");
  } catch {
    return null;
  }
}

export async function writeActiveFeature(
  projectRoot: string,
  name: string,
  content: string
): Promise<void> {
  await mkdir(activeDir(projectRoot), { recursive: true });
  await writeFile(activeFeaturePath(projectRoot, name), content, "utf-8");
}

export async function getActiveFeature(projectRoot: string): Promise<{ name: string; path: string } | null> {
  try {
    const files = await readdir(activeDir(projectRoot));
    const md = files.filter((f) => f.endsWith(".md"));
    if (md.length === 0) return null;
    const name = md[0].replace(/\.md$/, "");
    return { name, path: `.alchemist/features/active/${md[0]}` };
  } catch {
    return null;
  }
}

export async function archiveFeature(projectRoot: string, name: string): Promise<string> {
  const date = new Date().toISOString().split("T")[0];
  const filename = `${date}-${name}.md`;
  const src = activeFeaturePath(projectRoot, name);
  const dest = join(archiveDir(projectRoot), filename);

  await mkdir(archiveDir(projectRoot), { recursive: true });
  await rename(src, dest);

  return `.alchemist/features/archive/${filename}`;
}

export async function listArchivedFeatures(projectRoot: string): Promise<ArchivedFeature[]> {
  try {
    const files = await readdir(archiveDir(projectRoot));
    const results: ArchivedFeature[] = [];

    for (const file of files.filter((f) => f.endsWith(".md")).sort().reverse()) {
      // filename format: YYYY-MM-DD-{name}.md
      const match = file.match(/^(\d{4}-\d{2}-\d{2})-(.+)\.md$/);
      if (match) {
        results.push({
          name: match[2],
          filename: file,
          path: `.alchemist/features/archive/${file}`,
          completedAt: match[1],
        });
      }
    }

    return results;
  } catch {
    return [];
  }
}

export async function findRelatedArchived(
  projectRoot: string,
  scope: string
): Promise<ArchivedFeature[]> {
  const all = await listArchivedFeatures(projectRoot);
  if (!scope) return [];
  const lower = scope.toLowerCase();
  return all.filter((f) => f.name.toLowerCase().includes(lower));
}

export async function readArchivedFeature(projectRoot: string, filename: string): Promise<string | null> {
  try {
    return await readFile(join(archiveDir(projectRoot), filename), "utf-8");
  } catch {
    return null;
  }
}

export async function getArchivedFeatureMtime(projectRoot: string, filename: string): Promise<string | null> {
  try {
    const s = await stat(join(archiveDir(projectRoot), filename));
    return s.mtime.toISOString();
  } catch {
    return null;
  }
}
