import { writeFile, mkdir, chmod, readFile } from "node:fs/promises";
import { join } from "node:path";

const POST_COMMIT_HOOK = `#!/bin/sh
# Alchemist Living Context — auto-sync on commit
npx @alchemist/context sync --silent 2>/dev/null &
`;

const ALCHEMIST_MARKER = "# Alchemist Living Context";

export async function installHooks(projectRoot: string): Promise<void> {
  const hooksDir = join(projectRoot, ".git", "hooks");

  try {
    await mkdir(hooksDir, { recursive: true });
  } catch {
    // .git might not exist yet — hooks will be installed after git init
    console.log("  Warning: .git/hooks not found — hook will be installed after git init");
    return;
  }

  const hookPath = join(hooksDir, "post-commit");

  // Check if hook already exists
  try {
    const existing = await readFile(hookPath, "utf-8");
    if (existing.includes(ALCHEMIST_MARKER)) {
      // Already installed
      return;
    }
    // Append to existing hook
    const updated = existing.trimEnd() + "\n\n" + POST_COMMIT_HOOK;
    await writeFile(hookPath, updated, "utf-8");
  } catch {
    // No existing hook — write new one
    await writeFile(hookPath, POST_COMMIT_HOOK, "utf-8");
  }

  await chmod(hookPath, 0o755);
  console.log("  Installed post-commit hook");
}
