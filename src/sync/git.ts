import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { RecentChange } from "../store/context.js";

const exec = promisify(execFile);

export async function getRecentCommits(
  projectRoot: string,
  count: number = 10
): Promise<RecentChange[]> {
  try {
    const { stdout } = await exec(
      "git",
      ["log", `--max-count=${count}`, "--pretty=format:%H|%s|%aI", "--name-only"],
      { cwd: projectRoot, timeout: 10000 }
    );

    const changes: RecentChange[] = [];
    const blocks = stdout.trim().split("\n\n");

    for (const block of blocks) {
      const lines = block.split("\n").filter(Boolean);
      if (lines.length === 0) continue;

      const [headerLine, ...fileLines] = lines;
      const parts = headerLine.split("|");
      if (parts.length < 3) continue;

      changes.push({
        hash: parts[0].slice(0, 8),
        message: parts[1],
        date: parts[2],
        filesChanged: fileLines,
      });
    }

    return changes;
  } catch {
    return [];
  }
}

export async function getLastCommitHash(projectRoot: string): Promise<string | null> {
  try {
    const { stdout } = await exec(
      "git",
      ["rev-parse", "--short", "HEAD"],
      { cwd: projectRoot, timeout: 5000 }
    );
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

export async function getChangedFilesSince(
  projectRoot: string,
  sinceHash: string
): Promise<string[]> {
  try {
    const { stdout } = await exec(
      "git",
      ["diff", "--name-only", sinceHash, "HEAD"],
      { cwd: projectRoot, timeout: 10000 }
    );
    return stdout.trim().split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

export async function isGitRepo(projectRoot: string): Promise<boolean> {
  try {
    await exec("git", ["rev-parse", "--is-inside-work-tree"], { cwd: projectRoot, timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}
