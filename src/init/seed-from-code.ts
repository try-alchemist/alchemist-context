import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { writeConfig, type AlchemistConfig } from "../config.js";
import { writeDecisions } from "../store/decisions.js";
import { writeFailures } from "../store/failures.js";
import { writeContext, type ProjectContext } from "../store/context.js";
import { injectClaudeMdLivingContext } from "./claude-md-template.js";

const API_BASE = process.env.ALCHEMIST_API_URL ?? "https://api.try-alchemist.com";

interface ArtifactPayload {
  id: string;
  title: string;
  description: string;
  content: string;
  firingOrder: number;
}

interface RetrieveResponse {
  artifacts: ArtifactPayload[];
  projectBrief: {
    projectName: string;
    stack: Record<string, string>;
    extraction: {
      profile?: string;
      [key: string]: unknown;
    };
  };
}

export async function seedFromCode(projectRoot: string, code: string): Promise<void> {
  // 1. Fetch artifacts from backend
  const response = await fetch(`${API_BASE}/context/retrieve-artifacts/${code}`);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to retrieve artifacts: ${response.status} — ${body}`);
  }

  const data = (await response.json()) as RetrieveResponse;
  const { artifacts, projectBrief } = data;

  // 2. Create directories
  await mkdir(join(projectRoot, ".alchemist", "archive"), { recursive: true });
  await mkdir(join(projectRoot, ".claude", "commands"), { recursive: true });

  // 3. Write artifact files
  for (const artifact of artifacts) {
    const filePath = getArtifactPath(projectRoot, artifact.id);
    if (!filePath) continue;

    if (artifact.id === "commands") {
      // Commands artifact contains multiple files separated by headers
      await writeCommandFiles(projectRoot, artifact.content);
    } else {
      await writeFile(filePath, artifact.content, "utf-8");
      console.log(`  Wrote ${artifact.title}`);
    }
  }

  // 4. Inject Living Context instructions into CLAUDE.md
  await injectClaudeMdLivingContext(projectRoot);

  // 5. Write config
  const config: AlchemistConfig = {
    version: "1.0.0",
    projectName: projectBrief.projectName,
    alchemistVersion: "0.1.0",
    seededFrom: code,
    seededAt: new Date().toISOString(),
    ignorePatterns: ["node_modules", ".next", "dist", "build", "*.lock"],
    tagRules: {},
    watchDebounceMs: 10000,
    maxRecentChanges: 10,
    stack: projectBrief.stack,
  };
  await writeConfig(projectRoot, config);

  // 6. Seed decisions from Coding Mode stack choices
  const decisions = Object.entries(projectBrief.stack)
    .filter(([, v]) => v && v !== "not_sure")
    .map(([ category, choice], i) => ({
      id: `seed-${String(i + 1).padStart(3, "0")}`,
      decision: `Using ${choice} for ${category}`,
      rationale: "Selected during project setup in Alchemist Coding Mode.",
      topic: [category],
      madeAt: new Date().toISOString(),
      source: "alchemist-coding-mode",
    }));
  await writeDecisions(projectRoot, decisions);
  if (decisions.length > 0) {
    console.log(`  Pre-loaded ${decisions.length} decisions from Coding Mode`);
  }

  // 7. Init empty failures store
  await writeFailures(projectRoot, []);

  // 8. Write minimal context.json — files[] will be populated on first sync
  //    (no source code exists yet, sync would find nothing)
  const seedContext: ProjectContext = {
    projectName: config.projectName,
    generatedAt: new Date().toISOString(),
    seedVersion: "1.0.0",
    stack: projectBrief.stack,
    files: [],
    patterns: [],
    dependencies: [],
    recentChanges: [],
  };
  await writeContext(projectRoot, seedContext);
}

function getArtifactPath(projectRoot: string, id: string): string | null {
  switch (id) {
    case "spec": return join(projectRoot, "SPEC.md");
    case "plan": return join(projectRoot, "PLAN.md");
    case "design": return join(projectRoot, "DESIGN.md");
    case "claude": return join(projectRoot, "CLAUDE.md");
    case "commands": return null; // handled separately
    default: return null;
  }
}

async function writeCommandFiles(projectRoot: string, content: string): Promise<void> {
  const commandsDir = join(projectRoot, ".claude", "commands");
  await mkdir(commandsDir, { recursive: true });

  // Parse the combined content — files are separated by "### filename.md" headers
  const sections = content.split(/^### /m).filter(Boolean);
  for (const section of sections) {
    const firstNewline = section.indexOf("\n");
    if (firstNewline === -1) continue;

    const filename = section.slice(0, firstNewline).trim();
    const fileContent = section.slice(firstNewline + 1).replace(/^---\s*$/m, "").trim();

    if (filename.endsWith(".md")) {
      await writeFile(join(commandsDir, filename), fileContent + "\n", "utf-8");
      console.log(`  Wrote .claude/commands/${filename}`);
    }
  }
}
