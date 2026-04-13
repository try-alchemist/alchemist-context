#!/usr/bin/env node
import { Command } from "commander";
import { init } from "../src/init/index.js";
import { generate } from "../src/generate/index.js";
import { syncContext } from "../src/sync/sync-context.js";

const program = new Command();

program
  .name("alchemist-context")
  .description("Living Context for your projects — keeps Claude oriented across sessions")
  .version("0.1.0");

program
  .command("init")
  .description("Initialize Living Context for a project")
  .option("--code <code>", "Retrieval code from Alchemist Coding Mode")
  .option("--dir <directory>", "Project directory (defaults to current directory)")
  .action(async (options: { code?: string; dir?: string }) => {
    try {
      await init({
        code: options.code,
        projectRoot: options.dir ?? process.cwd(),
      });
    } catch (err) {
      console.error(`\x1b[31mError:\x1b[0m ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
  });

program
  .command("generate")
  .description("Generate SPEC.md and DESIGN.md from an existing codebase (Pro)")
  .option("--dir <directory>", "Project directory (defaults to current directory)")
  .option("--token <token>", "Auth token (or set ALCHEMIST_TOKEN env var)")
  .action(async (options: { dir?: string; token?: string }) => {
    const token = options.token ?? process.env.ALCHEMIST_TOKEN;
    if (!token) {
      console.error("\x1b[31mError:\x1b[0m Auth token required. Pass --token or set ALCHEMIST_TOKEN env var.");
      console.error("  Get your token at https://try-alchemist.com/settings");
      process.exit(1);
    }
    try {
      await generate(options.dir ?? process.cwd(), token);
    } catch (err) {
      console.error(`\x1b[31mError:\x1b[0m ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
  });

program
  .command("sync")
  .description("Manually sync project context")
  .option("--dir <directory>", "Project directory (defaults to current directory)")
  .option("--silent", "Suppress output")
  .action(async (options: { dir?: string; silent?: boolean }) => {
    try {
      const ctx = await syncContext(options.dir ?? process.cwd());
      if (!options.silent) {
        console.log(`Context synced: ${ctx.files.length} files, ${ctx.patterns.length} patterns`);
      }
    } catch (err) {
      if (!options.silent) {
        console.error(`\x1b[31mError:\x1b[0m ${err instanceof Error ? err.message : String(err)}`);
      }
      process.exit(1);
    }
  });

program
  .command("serve")
  .description("Start the MCP server (called by Claude Code / Cursor)")
  .option("--dir <directory>", "Project directory (defaults to current directory)")
  .action(async (options: { dir?: string }) => {
    // Dynamically import to avoid loading MCP SDK for other commands
    const { StdioServerTransport } = await import("@modelcontextprotocol/sdk/server/stdio.js");
    const { createServer } = await import("../src/server.js");
    const { startWatcher } = await import("../src/sync/watcher.js");
    const { loadConfig } = await import("../src/config.js");

    const projectRoot = options.dir ?? process.cwd();
    const config = await loadConfig(projectRoot);
    const server = createServer(projectRoot);

    // Start file watcher
    startWatcher({
      projectRoot,
      ignorePatterns: config.ignorePatterns,
      debounceMs: config.watchDebounceMs,
      onSync: () => {
        syncContext(projectRoot).catch(() => {});
      },
    });

    // Initial sync
    syncContext(projectRoot).catch(() => {});

    const transport = new StdioServerTransport();
    await server.connect(transport);
  });

program
  .command("dashboard")
  .description("Open the Alchemist Pro dashboard")
  .option("--port <port>", "Port number", "5173")
  .option("--no-open", "Don't auto-open browser")
  .action(async (opts: { port: string; open: boolean }) => {
    try {
      // @ts-ignore — @alchemist/pro is an optional peer dep, not declared in package.json
      const { startDashboard } = await import("@alchemist/pro/dashboard");
      await startDashboard({
        port: parseInt(opts.port),
        open: opts.open !== false,
        projectRoot: process.cwd(),
      });
    } catch {
      console.log("\n  Dashboard requires @alchemist/pro.");
      console.log("  Visit https://try-alchemist.com/pro to upgrade.\n");
    }
  });

program.parse();
