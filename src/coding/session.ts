import { readFile, writeFile, unlink, mkdir } from "node:fs/promises";
import { join } from "node:path";

// ── Types (copied from src/shared/types/coding-mode.ts — do NOT import) ──

export type ProjectProfile = "simple" | "standard" | "complex";

export interface ExtractionGap {
  field: string;
  reason: string;
}

export interface ExtractionAssumption {
  field: string;
  assumed: string;
  reason: string;
}

export interface CodingExtractionResult {
  intent: string;
  entities: string[];
  hasUI: boolean;
  projectType: string;
  complexity: "simple" | "moderate" | "complex";
  platform: "web" | "mobile_native" | "desktop" | "cli" | "api" | "unknown";
  audience: "personal" | "team" | "public" | "unknown";
  profile: ProjectProfile;
  gaps: ExtractionGap[];
  assumptions: ExtractionAssumption[];
}

export interface CodingQuestion {
  id: string;
  label: string;
  why: string;
  type: "single_select" | "multi_select" | "free_text";
  options?: CodingQuestionOption[];
  defaultOptionId?: string;
  required: boolean;
}

export interface CodingQuestionOption {
  id: string;
  label: string;
  description?: string;
  proscons?: string;
}

export interface CodingClarificationResult {
  questions: CodingQuestion[];
}

export interface StackOptionRec {
  id: string;
  label: string;
  description: string;
  costTier: "free" | "low" | "paid";
  recommended: boolean;
}

export interface StackCategoryRec {
  id: string;
  label: string;
  why: string;
  options: StackOptionRec[];
}

export interface RecommendationResult {
  stack: StackCategoryRec[];
}

export interface CodingUIQuestionsResult {
  questions: CodingQuestion[];
}

export type ArtifactType = "claude" | "spec" | "plan" | "design" | "commands";

export function getArtifactsForProfile(profile: ProjectProfile): ArtifactType[] {
  if (profile === "simple") return ["claude", "spec", "plan"];
  if (profile === "standard") return ["claude", "spec", "plan", "design"];
  return ["claude", "spec", "plan", "design", "commands"];
}

// ── Session ──

export interface CodingSession {
  ideaDump: string;
  extraction?: CodingExtractionResult;
  clarification?: CodingClarificationResult;
  clarificationAnswers?: { question: string; answer: string }[];
  recommendations?: RecommendationResult;
  stack?: Record<string, string>;
  uiQuestions?: CodingUIQuestionsResult;
  uiAnswers?: { question: string; answer: string }[];
}

function sessionPath(projectRoot: string): string {
  return join(projectRoot, ".alchemist", ".coding-session.json");
}

export async function readSession(projectRoot: string): Promise<CodingSession | null> {
  try {
    const raw = await readFile(sessionPath(projectRoot), "utf-8");
    return JSON.parse(raw) as CodingSession;
  } catch {
    return null;
  }
}

export async function writeSession(projectRoot: string, session: CodingSession): Promise<void> {
  const dir = join(projectRoot, ".alchemist");
  await mkdir(dir, { recursive: true });
  await writeFile(sessionPath(projectRoot), JSON.stringify(session, null, 2), "utf-8");
}

export async function clearSession(projectRoot: string): Promise<void> {
  try {
    await unlink(sessionPath(projectRoot));
  } catch {
    // Already gone — fine
  }
}
