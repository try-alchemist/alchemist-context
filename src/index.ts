#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";
import { startWatcher } from "./sync/watcher.js";
import { loadConfig } from "./config.js";
import { syncContext } from "./sync/sync-context.js";

async function main() {
  // Project root is passed as first argument or defaults to cwd
  const projectRoot = process.argv[2] || process.cwd();

  const config = await loadConfig(projectRoot);
  const server = createServer(projectRoot);

  // Start file watcher for auto-sync
  startWatcher({
    projectRoot,
    ignorePatterns: config.ignorePatterns,
    debounceMs: config.watchDebounceMs,
    onSync: () => {
      syncContext(projectRoot).catch(() => {
        // Silent — watcher sync failures are non-fatal
      });
    },
  });

  // Run initial sync
  syncContext(projectRoot).catch(() => {
    // Non-fatal — context.json may not exist yet
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Failed to start Alchemist Context server:", err);
  process.exit(1);
});
