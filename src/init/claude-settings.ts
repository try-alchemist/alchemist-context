import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

const HOOK_MARKER = "alchemist-check-briefing";

function makeCheckBriefingScript(projectRoot: string): string {
  const briefedPath = join(projectRoot, ".alchemist", ".briefed");
  // Use JSON.stringify to safely embed the path as a JS string literal
  const briefedPathLiteral = JSON.stringify(briefedPath);

  return `#!/usr/bin/env node
// ${HOOK_MARKER} — managed by @alchemist/context, do not edit manually
//
// Only fires for built-in Claude Code tools (matcher "^[A-Z]").
// MCP tools are all lowercase and never trigger this hook.
import { statSync } from "fs";

const BRIEFED_PATH = ${briefedPathLiteral};
const SESSION_WINDOW_MS = 4 * 60 * 60 * 1000; // 4 hours

try {
  const st = statSync(BRIEFED_PATH);
  if (Date.now() - st.mtimeMs < SESSION_WINDOW_MS) process.exit(0);
} catch {
  // File doesn't exist — fall through to block
}

process.stderr.write(
  "BLOCKED: You must call the MCP tool get_briefing() right now before using any other tools.\\n" +
  "It is already available in your tool list — do not search for it, just call it directly.\\n" +
  "It loads known failures, recent decisions, and project state. Skipping it causes repeated mistakes.\\n"
);
process.exit(2);
`;
}

interface ClaudeSettings {
  hooks?: {
    PreToolUse?: Array<{
      matcher: string;
      hooks: Array<{ type: string; command: string }>;
    }>;
  };
  [key: string]: unknown;
}

export async function writeClaudeSettings(projectRoot: string): Promise<void> {
  const claudeDir = join(projectRoot, ".claude");
  const settingsPath = join(claudeDir, "settings.json");
  const hooksDir = join(projectRoot, ".alchemist", "hooks");
  const scriptPath = join(hooksDir, "check-briefing.mjs");
  const scriptCommand = `node ${scriptPath}`; // absolute path — cwd-independent

  await mkdir(claudeDir, { recursive: true });
  await mkdir(hooksDir, { recursive: true });

  // Write the check script (always overwrite — keeps it in sync with the installed version)
  await writeFile(scriptPath, makeCheckBriefingScript(projectRoot), "utf-8");

  // Read existing settings or start fresh
  let settings: ClaudeSettings = {};
  try {
    const raw = await readFile(settingsPath, "utf-8");
    settings = JSON.parse(raw) as ClaudeSettings;
  } catch {
    // No existing settings — start fresh
  }

  settings.hooks ??= {};
  settings.hooks.PreToolUse ??= [];

  // Remove any stale alchemist hook entry, then re-add with current config
  settings.hooks.PreToolUse = settings.hooks.PreToolUse.filter(
    (entry) => !entry.hooks.some((h) => h.command.includes("check-briefing"))
  );

  settings.hooks.PreToolUse.push({
    matcher: "^(?!ToolSearch)[A-Z]", // built-in work tools (Bash, Read, Edit, Glob…); excludes ToolSearch so Claude can discover get_briefing; MCP tools are lowercase and never match
    hooks: [{ type: "command", command: scriptCommand }],
  });

  await writeFile(settingsPath, JSON.stringify(settings, null, 2) + "\n", "utf-8");
  console.log("  Wrote .claude/settings.json (PreToolUse hook)");
}
