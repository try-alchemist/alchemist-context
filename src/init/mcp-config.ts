import { writeFile, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";

interface McpConfig {
  mcpServers: Record<string, {
    command: string;
    args: string[];
  }>;
}

const SERVER_ENTRY = {
  command: "npx",
  args: ["-y", "@alchemist/context", "serve"],
};

export async function writeMcpConfigs(projectRoot: string): Promise<void> {
  // Claude Code config
  await writeMcpConfig(
    join(projectRoot, ".mcp.json"),
    "alchemist-context"
  );

  // Cursor config
  await writeMcpConfig(
    join(projectRoot, ".cursor", "mcp.json"),
    "alchemist-context"
  );
}

async function writeMcpConfig(configPath: string, serverName: string): Promise<void> {
  const dir = join(configPath, "..");
  await mkdir(dir, { recursive: true });

  let config: McpConfig;

  try {
    const existing = await readFile(configPath, "utf-8");
    config = JSON.parse(existing) as McpConfig;
  } catch {
    config = { mcpServers: {} };
  }

  // Don't overwrite if already configured
  if (config.mcpServers[serverName]) {
    return;
  }

  config.mcpServers[serverName] = SERVER_ENTRY;
  await writeFile(configPath, JSON.stringify(config, null, 2) + "\n", "utf-8");

  const name = configPath.includes(".cursor") ? ".cursor/mcp.json" : ".mcp.json";
  console.log(`  Wrote ${name}`);
}
