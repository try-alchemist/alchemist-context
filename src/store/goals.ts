import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

export interface Goal {
  id: string;
  text: string;
  status: "active" | "completed" | "abandoned";
  capturedAt: string;
  completedAt?: string;
  source: "auto-capture" | "manual";
}

interface GoalsStore {
  goals: Goal[];
}

function goalsPath(projectRoot: string): string {
  return join(projectRoot, ".alchemist", "goals.json");
}

export async function readGoals(projectRoot: string): Promise<Goal[]> {
  try {
    const raw = await readFile(goalsPath(projectRoot), "utf-8");
    const store = JSON.parse(raw) as GoalsStore;
    return Array.isArray(store.goals) ? store.goals : [];
  } catch {
    return [];
  }
}

export async function writeGoals(projectRoot: string, goals: Goal[]): Promise<void> {
  await writeFile(goalsPath(projectRoot), JSON.stringify({ goals }, null, 2), "utf-8");
}

export async function getActiveGoal(projectRoot: string): Promise<Goal | null> {
  const goals = await readGoals(projectRoot);
  return goals.find((g) => g.status === "active") ?? null;
}

export async function setActiveGoal(
  projectRoot: string,
  text: string,
  source: "auto-capture" | "manual" = "auto-capture"
): Promise<Goal> {
  const goals = await readGoals(projectRoot);
  // Mark any existing active goal as abandoned
  for (const g of goals) {
    if (g.status === "active") {
      g.status = "abandoned";
    }
  }
  const entry: Goal = {
    id: randomUUID(),
    text,
    status: "active",
    capturedAt: new Date().toISOString(),
    source,
  };
  goals.push(entry);
  await writeGoals(projectRoot, goals);
  return entry;
}

export async function completeGoal(projectRoot: string, id: string): Promise<void> {
  const goals = await readGoals(projectRoot);
  const goal = goals.find((g) => g.id === id);
  if (goal) {
    goal.status = "completed";
    goal.completedAt = new Date().toISOString();
    await writeGoals(projectRoot, goals);
  }
}
