import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

export interface AlchemistConfig {
  version: string;
  projectName: string;
  alchemistVersion: string;
  seededFrom?: string;
  seededAt?: string;
  ignorePatterns: string[];
  tagRules: Record<string, string[]>;
  watchDebounceMs: number;
  maxRecentChanges: number;
  stack?: Record<string, string>;
}

const DEFAULT_CONFIG: AlchemistConfig = {
  version: "1.0.0",
  projectName: "my-project",
  alchemistVersion: "0.1.0",
  ignorePatterns: ["node_modules", ".next", "dist", "build", "*.lock"],
  tagRules: {},
  watchDebounceMs: 10000,
  maxRecentChanges: 10,
};

function configPath(projectRoot: string): string {
  return join(projectRoot, ".alchemist", "config.json");
}

export async function loadConfig(projectRoot: string): Promise<AlchemistConfig> {
  try {
    const raw = await readFile(configPath(projectRoot), "utf-8");
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export async function writeConfig(projectRoot: string, config: AlchemistConfig): Promise<void> {
  const dir = join(projectRoot, ".alchemist");
  await mkdir(dir, { recursive: true });
  await writeFile(configPath(projectRoot), JSON.stringify(config, null, 2), "utf-8");
}
