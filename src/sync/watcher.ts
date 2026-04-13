import { watch } from "chokidar";
import type { FSWatcher } from "chokidar";

export interface WatcherOptions {
  projectRoot: string;
  ignorePatterns: string[];
  debounceMs: number;
  onSync: () => void;
}

let watcher: FSWatcher | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

export function startWatcher(options: WatcherOptions): void {
  if (watcher) return; // already running

  const ignored = [
    /node_modules/,
    /\.git/,
    /\.next/,
    /dist/,
    /build/,
    /\.alchemist\/context\.json/, // don't watch our own output
    /coverage/,
    ...options.ignorePatterns.map((p) => new RegExp(p.replace(/\*/g, ".*"))),
  ];

  watcher = watch(options.projectRoot, {
    ignored,
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 2000 },
  });

  watcher.on("all", () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      options.onSync();
    }, options.debounceMs);
  });
}

export function stopWatcher(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  if (watcher) {
    watcher.close();
    watcher = null;
  }
}
