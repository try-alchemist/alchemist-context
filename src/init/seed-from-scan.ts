import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { writeConfig, type AlchemistConfig } from "../config.js";
import { writeDecisions } from "../store/decisions.js";
import { writeFailures } from "../store/failures.js";
import { syncContext } from "../sync/sync-context.js";
import { detectStack } from "../generate/stack-detect.js";
import { injectClaudeMdLivingContext } from "./claude-md-template.js";
import * as readline from "node:readline";

export async function seedFromScan(projectRoot: string): Promise<void> {
  // 1. Create directories
  await mkdir(join(projectRoot, ".alchemist", "archive"), { recursive: true });

  // 2. Detect stack
  const stack = await detectStack(projectRoot);
  console.log("  Detected stack:");
  for (const [k, v] of Object.entries(stack)) {
    console.log(`    ${k}: ${v}`);
  }

  // 3. Prompt for project name
  const projectName = await askProjectName();

  // 4. Write config
  const config: AlchemistConfig = {
    version: "1.0.0",
    projectName,
    alchemistVersion: "0.1.0",
    ignorePatterns: ["node_modules", ".next", "dist", "build", "*.lock"],
    tagRules: {},
    watchDebounceMs: 10000,
    maxRecentChanges: 10,
    stack,
  };
  await writeConfig(projectRoot, config);

  // 5. Init empty stores
  await writeDecisions(projectRoot, []);
  await writeFailures(projectRoot, []);

  // 6. Inject Living Context into CLAUDE.md (creates if needed)
  await injectClaudeMdLivingContext(projectRoot);

  // 7. Run context sync
  const ctx = await syncContext(projectRoot);
  console.log(`  Scanned ${ctx.files.length} files, detected ${ctx.patterns.length} patterns`);
}

function askProjectName(): Promise<string> {
  return new Promise((resolve) => {
    // Non-interactive fallback
    if (!process.stdin.isTTY) {
      resolve("my-project");
      return;
    }

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question("  Project name: ", (answer) => {
      rl.close();
      resolve(answer.trim() || "my-project");
    });
  });
}
