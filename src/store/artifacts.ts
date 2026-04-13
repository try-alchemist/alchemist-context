import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

type ArtifactName = "spec" | "design";

const ARTIFACT_FILES: Record<ArtifactName, string> = {
  spec: "SPEC.md",
  design: "DESIGN.md",
};

export async function readArtifact(projectRoot: string, name: ArtifactName): Promise<string | null> {
  try {
    return await readFile(join(projectRoot, ARTIFACT_FILES[name]), "utf-8");
  } catch {
    return null;
  }
}

/**
 * Update a specific section of SPEC.md or DESIGN.md.
 * Finds the section heading and replaces content up to the next heading of same or higher level.
 * If section doesn't exist, appends it.
 */
export async function updateArtifactSection(
  projectRoot: string,
  name: ArtifactName,
  section: string,
  content: string
): Promise<{ updated: boolean; message: string }> {
  const filePath = join(projectRoot, ARTIFACT_FILES[name]);
  let existing: string;
  try {
    existing = await readFile(filePath, "utf-8");
  } catch {
    return { updated: false, message: `${ARTIFACT_FILES[name]} does not exist` };
  }

  const lines = existing.split("\n");
  const sectionHeading = normalizeHeading(section);

  // Find the section
  let sectionStart = -1;
  let sectionLevel = 0;
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^(#{1,6})\s+(.+)/);
    if (match && normalizeHeading(match[2]) === sectionHeading) {
      sectionStart = i;
      sectionLevel = match[1].length;
      break;
    }
  }

  if (sectionStart === -1) {
    // Section doesn't exist — append it
    const newSection = `\n## ${section}\n\n${content}\n`;
    const updated = existing.trimEnd() + "\n" + newSection;
    await writeFile(filePath, updated, "utf-8");
    appendChangelog(filePath, section, "added");
    return { updated: true, message: `Added new section "${section}" to ${ARTIFACT_FILES[name]}` };
  }

  // Find end of section (next heading of same or higher level)
  let sectionEnd = lines.length;
  for (let i = sectionStart + 1; i < lines.length; i++) {
    const match = lines[i].match(/^(#{1,6})\s+/);
    if (match && match[1].length <= sectionLevel) {
      sectionEnd = i;
      break;
    }
  }

  // Replace section content
  const heading = lines[sectionStart];
  const newLines = [
    ...lines.slice(0, sectionStart),
    heading,
    "",
    content,
    "",
    ...lines.slice(sectionEnd),
  ];

  await writeFile(filePath, newLines.join("\n"), "utf-8");
  await appendChangelog(filePath, section, "updated");
  return { updated: true, message: `Updated section "${section}" in ${ARTIFACT_FILES[name]}` };
}

function normalizeHeading(text: string): string {
  return text.trim().toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ");
}

async function appendChangelog(filePath: string, section: string, action: string): Promise<void> {
  try {
    let content = await readFile(filePath, "utf-8");
    const timestamp = new Date().toISOString().split("T")[0];
    const entry = `- ${timestamp}: ${action} "${section}"`;

    if (content.includes("## Changelog")) {
      content = content.replace(
        /## Changelog\n/,
        `## Changelog\n${entry}\n`
      );
    } else {
      content = content.trimEnd() + `\n\n## Changelog\n${entry}\n`;
    }
    await writeFile(filePath, content, "utf-8");
  } catch {
    // Non-fatal
  }
}
