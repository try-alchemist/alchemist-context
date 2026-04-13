import { seedFromCode } from "./seed-from-code.js";
import { seedFromScan } from "./seed-from-scan.js";
import { installHooks } from "./hooks.js";
import { writeMcpConfigs } from "./mcp-config.js";
import { writeClaudeSettings } from "./claude-settings.js";
import { isGitRepo } from "../sync/git.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

export interface InitOptions {
  code?: string;
  projectRoot: string;
}

export async function init(options: InitOptions): Promise<void> {
  const { code, projectRoot } = options;

  if (code) {
    // Journey A: New project from Coding Mode
    console.log("Fetching project from Alchemist...\n");
    await seedFromCode(projectRoot, code);
  } else {
    // Journey B: Existing project (free tier)
    console.log("Scanning existing project...\n");
    await seedFromScan(projectRoot);
  }

  // Init git if needed
  if (!(await isGitRepo(projectRoot))) {
    try {
      await exec("git", ["init"], { cwd: projectRoot });
      console.log("  Initialized git repository");
    } catch {
      console.log("  Warning: could not initialize git repository");
    }
  }

  // Install hooks and MCP configs
  await installHooks(projectRoot);
  await writeMcpConfigs(projectRoot);
  await writeClaudeSettings(projectRoot);

  // Print summary
  if (code) {
    printCodeSummary();
  } else {
    printScanSummary();
  }
}

function printCodeSummary(): void {
  console.log(`
\x1b[32m✅ Project scaffolded and Living Context activated\x1b[0m

  Files written:
    SPEC.md          — Project requirements (keeps evolving as you build)
    PLAN.md          — Phased build plan (archive when initial build is done)
    DESIGN.md        — Design system & page inventory (if applicable)
    CLAUDE.md        — Coding conventions + context management
    .claude/commands — Slash command workflows (if applicable)

  Living Context:
    .alchemist/      — Context store (auto-updates as you build)
    .claude/mcp.json — Claude Code integration
    .cursor/mcp.json — Cursor integration
    Git hook         — Auto-syncs context on every commit

  Open Claude Code and tell it: "Read the project files and build phase 1."
`);
}

function printScanSummary(): void {
  console.log(`
\x1b[32m✅ Living Context activated\x1b[0m

  Living Context:
    .alchemist/      — Context store (auto-updates as you build)
    .claude/mcp.json — Claude Code integration
    .cursor/mcp.json — Cursor integration
    Git hook         — Auto-syncs context on every commit

  Tools available in your next Claude Code session:
    get_briefing()    — Project state overview
    get_project_map() — Structured file map
    log_decision()    — Persist architectural choices
    log_failure()     — Record failed approaches

  For full context (SPEC.md, DESIGN.md), run:
    npx @alchemist/context generate
`);
}
