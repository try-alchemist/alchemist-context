import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { getBriefing } from "./tools/get-briefing.js";
import { getProjectMap } from "./tools/get-project-map.js";
import { getDecisions } from "./tools/get-decisions.js";
import { getFailures } from "./tools/get-failures.js";
import { getContext } from "./tools/get-context.js";
import { logDecision } from "./tools/log-decision.js";
import { logFailure } from "./tools/log-failure.js";
import { updateArtifact } from "./tools/update-artifact.js";
import { syncContextTool } from "./tools/sync-context-tool.js";
import { completeTask } from "./tools/complete-task.js";
import { planFeature } from "./tools/plan-feature.js";
import { completeFeature } from "./tools/complete-feature.js";
import { readSession, writeSession, clearSession, getArtifactsForProfile } from "./coding/session.js";
import type { CodingExtractionResult, CodingClarificationResult, RecommendationResult, CodingUIQuestionsResult } from "./coding/session.js";
import {
  CODING_EXTRACT_SYSTEM_PROMPT,
  CODING_CLARIFY_SYSTEM_PROMPT,
  CODING_RECOMMEND_SYSTEM_PROMPT,
  CODING_ASK_UI_SYSTEM_PROMPT,
  CODING_GENERATE_SPEC_PROMPT,
  CODING_GENERATE_PLAN_PROMPT,
  CODING_GENERATE_DESIGN_PROMPT,
  CODING_GENERATE_CLAUDE_PROMPT,
  CODING_GENERATE_COMMANDS_PROMPT,
} from "./coding/prompts.js";
import { formatProjectBrief } from "./coding/format.js";
import { mapQuestionsToAskUser } from "./coding/map-questions.js";
import { injectClaudeMdLivingContext } from "./init/claude-md-template.js";
import { writeConfig } from "./config.js";
import type { AlchemistConfig } from "./config.js";
import { writeDecisions } from "./store/decisions.js";
import { writeFailures } from "./store/failures.js";
import { registerDocTool } from "./tools/register-doc.js";
import { findDocsTool } from "./tools/find-docs.js";
import { archiveDocTool } from "./tools/archive-doc.js";
import { addDocument } from "./store/documents.js";

export function createServer(projectRoot: string): McpServer {
  const server = new McpServer({
    name: "alchemist-context",
    version: "0.3.0",
  });

  // ── Session Start Tools ──

  server.tool(
    "get_briefing",
    "FIRST TOOL TO CALL in any session. Call this BEFORE reading any files or writing any code. Returns the full project state: active goal (what you're working toward), recent constraints (don't-touch rules), recent decisions, known failures to avoid, recent commits, and artifact freshness. Skipping this wastes thousands of tokens on rediscovery.",
    {},
    async () => {
      const briefing = await getBriefing(projectRoot);
      // Write sentinel so the PreToolUse hook knows briefing was called this session
      await mkdir(join(projectRoot, ".alchemist"), { recursive: true });
      await writeFile(join(projectRoot, ".alchemist", ".briefed"), new Date().toISOString(), "utf-8");
      const isFreshProject = !briefing.artifactStatus.specLastUpdated || briefing.artifactStatus.specLastUpdated === "never (not yet generated)";
      const newProjectHint = isFreshProject
        ? `\n\n→ NO PROJECT CONTEXT FOUND. If the user wants to start a new project from an idea, call start_coding_project(idea) — it will walk through requirements, stack selection, design questions, and generate all project files (CLAUDE.md, SPEC.md, PLAN.md, DESIGN.md). Do NOT create these files manually.`
        : "";
      const featureReminder = briefing.activeFeature
        ? `\n\n→ ACTIVE FEATURE IN PROGRESS: "${briefing.activeFeature.name}" — read the spec at ${briefing.activeFeature.path} before doing anything else.`
        : `\n\n→ If the user has asked you to add or change a feature, call plan_feature() BEFORE reading any implementation files or writing any code. The spec will tell you which files to read.`;
      const contradictionNotice = briefing.contradictions && briefing.contradictions.length > 0
        ? `\n\n⚠ ${briefing.contradictions.length} superseded decision(s) detected — newer decisions have replaced older ones on the same topic. Review the "contradictions" field in the briefing before making related choices.`
        : "";
      return { content: [{ type: "text", text: JSON.stringify(briefing, null, 2) + newProjectHint + featureReminder + contradictionNotice }] };
    }
  );

  server.tool(
    "get_project_map",
    "Call BEFORE implementing changes in any domain. Returns all files, their purposes, exports, imports, and detected patterns for a scope (e.g. 'auth', 'ui', 'api'). Use this INSTEAD of reading 5+ individual files — saves hundreds of tokens and shows architectural patterns. Always pass a scope for focused results.",
    { scope: z.string().optional().describe("Domain to filter: 'auth', 'payments', 'ui', 'api', 'state', 'data', etc. Pass a scope for focused results.") },
    async ({ scope }) => {
      const map = await getProjectMap(projectRoot, scope);
      return { content: [{ type: "text", text: JSON.stringify(map, null, 2) }] };
    }
  );

  server.tool(
    "get_decisions",
    "Call BEFORE making any architectural choice (library, pattern, approach). Previous sessions already made decisions that are logged here — do NOT re-debate them. If you're about to choose between options, check here first. With Pro memory active, the topic parameter uses semantic search (finds 'JWT refresh with Supabase' when you search 'auth'). Superseded decisions are excluded by default.",
    { topic: z.string().optional().describe("Topic filter: 'auth', 'state', 'data-fetching', 'ui', etc. Omit for all decisions. Semantic match when Pro memory is active.") },
    async ({ topic }) => {
      const decisions = await getDecisions(projectRoot, topic);
      const count = decisions.length;
      const suffix = count === 0
        ? "No decisions logged yet for this topic."
        : `${count} decision(s) found. Honor these — they were made deliberately in previous sessions.`;
      return { content: [{ type: "text", text: `${suffix}\n\n${JSON.stringify(decisions, null, 2)}` }] };
    }
  );

  server.tool(
    "get_failures",
    "Call BEFORE trying any new implementation approach. Contains approaches that FAILED in previous sessions — retrying them will waste time. If an approach is listed here, do NOT attempt it again unless the reason no longer applies. With Pro memory active, the topic parameter uses semantic search.",
    { topic: z.string().optional().describe("Topic filter: 'auth', 'deployment', 'state', etc. Omit for all failures. Semantic match when Pro memory is active.") },
    async ({ topic }) => {
      const failures = await getFailures(projectRoot, topic);
      const count = failures.length;
      const suffix = count === 0
        ? "No failed approaches logged for this topic."
        : `${count} failed approach(es) found. Do NOT retry these unless the failure reason no longer applies.`;
      return { content: [{ type: "text", text: `${suffix}\n\n${JSON.stringify(failures, null, 2)}` }] };
    }
  );

  // ── Phase 4: Semantic Context Search (Pro) ──

  server.tool(
    "get_context",
    "PRO ONLY. Semantic search across ALL context stores (decisions, failures, goals, constraints, preferences, features) — finds entries by meaning, not keyword. Use this when 'get_decisions(\"auth\")' might miss relevant JWT decisions because the word 'auth' isn't in the text. Results are re-ranked by decay score: recently-accessed and frequently-used entries surface first; constraints and preferences never decay. Falls back to empty results when Pro memory is not active (no embeddings.db).",
    {
      query: z.string().describe("Natural-language query — what you're looking for by meaning, e.g. 'authentication problems', 'state management'"),
      types: z.array(z.string()).optional().describe("Filter to specific capture types. Defaults to all: ['decisions','failures','goals','constraints','preferences','features']"),
      limit: z.number().optional().describe("Maximum results to return. Defaults to 10."),
    },
    async ({ query, types, limit }) => {
      const results = await getContext(projectRoot, { query, types, limit });
      const count = results.length;
      const suffix = count === 0
        ? "No semantically similar context found. Either there are no relevant entries yet, or Pro memory is not active (no .alchemist/embeddings.db)."
        : `${count} relevant result(s) found. Ranked by similarity × decay score.`;
      return { content: [{ type: "text", text: `${suffix}\n\n${JSON.stringify(results, null, 2)}` }] };
    }
  );

  // ── Post-Action Tools ──

  server.tool(
    "log_decision",
    "Call IMMEDIATELY after choosing between implementation options (library, pattern, approach, architecture). If you just chose X over Y, log it NOW before writing more code. Future sessions will check this before making the same choice.",
    {
      decision: z.string().describe("What was decided, e.g. 'Using Zustand for client state instead of Redux'"),
      rationale: z.string().describe("Why this choice was made and what alternatives were rejected"),
      topic: z.union([z.string(), z.array(z.string())]).describe("Tags for filtering, e.g. ['state', 'frontend'] or 'state'"),
    },
    async ({ decision, rationale, topic }) => {
      const topicArr = Array.isArray(topic) ? topic : [topic];
      const entry = await logDecision(projectRoot, decision, rationale, topicArr);
      const supersededNotice = entry.supersedesId
        ? `\n\n⚠ This decision supersedes an earlier contradictory decision (id: ${entry.supersedesId}). The old decision has been automatically marked as superseded — future get_decisions() calls will exclude it.`
        : "";
      return { content: [{ type: "text", text: `Decision logged: ${entry.id}${supersededNotice}\n\n→ Next: If this decision changed a feature, call update_artifact("spec", section, content) to keep SPEC.md accurate.\n→ Next: If this changed UI patterns, call update_artifact("design", section, content) too.` }] };
    }
  );

  server.tool(
    "log_failure",
    "Call IMMEDIATELY when an approach fails — BEFORE trying the next approach. This prevents future sessions from wasting time on the same dead end. Log what you tried, why it failed, and what you're switching to.",
    {
      approach: z.string().describe("What was tried, e.g. 'Tried using React Query for optimistic updates'"),
      reason: z.string().describe("Why it failed, e.g. 'Does not support optimistic updates for mutations with dependent queries'"),
      topic: z.union([z.string(), z.array(z.string())]).describe("Tags for filtering, e.g. ['data-fetching', 'state'] or 'state'"),
      workaround: z.string().optional().describe("What you're switching to instead"),
    },
    async ({ approach, reason, topic, workaround }) => {
      const topicArr = Array.isArray(topic) ? topic : [topic];
      const entry = await logFailure(projectRoot, approach, reason, topicArr, workaround);
      return { content: [{ type: "text", text: `Failure logged: ${entry.id}\n\n→ Next: Call get_failures("${topic[0] ?? ""}") before trying your next approach to check for other known failures in this area.` }] };
    }
  );

  server.tool(
    "register_doc",
    "Call this IMMEDIATELY after creating any markdown file outside of .alchemist/. Logs the file with a one-sentence purpose summary so future sessions can find it without reading every file in the project. Also call this when you discover an existing unregistered markdown file that is relevant to current work.",
    {
      path: z.string().describe("Path to the markdown file, relative to project root (e.g. 'auth-spec.md' or 'docs/api.md')"),
      purpose: z.string().describe("One sentence describing what this document is for and when it should be referenced"),
      relatedFeature: z.string().optional().describe("Feature slug this doc belongs to, if any (e.g. 'user-auth', 'coding-mode-overhaul')"),
    },
    async ({ path, purpose, relatedFeature }) => {
      const doc = await registerDocTool(projectRoot, path, purpose, relatedFeature);
      return {
        content: [{
          type: "text",
          text: `Registered: ${doc.path}\nPurpose: ${doc.purpose}\nStatus: ${doc.status}\nID: ${doc.id}`,
        }],
      };
    }
  );

  server.tool(
    "find_docs",
    "Search registered project documents by keyword before creating a new doc or when the user references something vaguely. Returns path, purpose, and status for each match. Call this before writing a new markdown file to check whether one already exists. Also call this when starting work in a new area to discover prior context.",
    {
      query: z.string().describe("Keyword or phrase to search — matched against file path, purpose, and related feature"),
    },
    async ({ query }) => {
      const result = await findDocsTool(projectRoot, query);
      if (result.count === 0) {
        return { content: [{ type: "text", text: `No registered documents found matching "${query}".` }] };
      }
      const lines = result.docs.map((d) =>
        `[${d.status.toUpperCase()}] ${d.path}\n  Purpose: ${d.purpose}${d.relatedFeature ? `\n  Feature: ${d.relatedFeature}` : ""}`
      );
      return {
        content: [{
          type: "text",
          text: `Found ${result.count} document(s) matching "${query}":\n\n${lines.join("\n\n")}`,
        }],
      };
    }
  );

  server.tool(
    "archive_doc",
    "Mark a registered document as archived when the work it describes is complete or the document has been superseded. Does not delete the file — only updates its status in the registry so it stops appearing in briefings and find_docs results.",
    {
      path: z.string().describe("Path to the document, relative to project root"),
      reason: z.string().describe("Why this document is being archived (e.g. 'Feature completed', 'Superseded by redesign-v2.md')"),
    },
    async ({ path, reason }) => {
      const result = await archiveDocTool(projectRoot, path, reason);
      if (!result.success || !result.doc) {
        return { content: [{ type: "text", text: `No registered document found at path: ${path}` }] };
      }
      return {
        content: [{
          type: "text",
          text: `Archived: ${result.doc.path}\nReason: ${reason}`,
        }],
      };
    }
  );

  server.tool(
    "update_artifact",
    "Call this IMMEDIATELY after any code change that adds, removes, or modifies a feature — do not wait for user feedback. If SPEC.md or DESIGN.md no longer matches what you just built, update it NOW. Stale docs cause future sessions to produce wrong code. Not just for big changes — any feature change counts.",
    {
      artifact: z.enum(["spec", "design"]).describe("'spec' for SPEC.md (features, requirements, data model). 'design' for DESIGN.md (UI, pages, components, layout)."),
      section: z.string().describe("Section heading to update, e.g. 'Features', 'Authentication', 'Dashboard Page'"),
      content: z.string().describe("New content for this section — replaces the existing section content"),
    },
    async ({ artifact, section, content }) => {
      const result = await updateArtifact(projectRoot, artifact, section, content);
      const otherArtifact = artifact === "spec" ? "design" : "spec";
      return { content: [{ type: "text", text: `${result.message}\n\n→ Next: If you also changed ${otherArtifact === "spec" ? "features/requirements" : "UI/pages/components"}, call update_artifact("${otherArtifact}", section, content) too.` }] };
    }
  );

  server.tool(
    "sync_context",
    "Call IMMEDIATELY after creating 3+ new files — do not wait for user feedback. Required before get_project_map() will show newly created files. Also call immediately after major refactors that rename or move files.",
    {},
    async () => {
      const result = await syncContextTool(projectRoot);
      return { content: [{ type: "text", text: `${result.message}\n\n→ Project map is now current. Call get_project_map(scope) to see the updated file structure.` }] };
    }
  );

  // ── Feature Workflow Tools ──

  server.tool(
    "plan_feature",
    "Call this when the user asks you to add or change a feature — BEFORE reading any implementation files or writing any code. Do not decide to skip it based on perceived scope; call it first. The spec it generates will tell you which files to read. Writes a feature spec covering: implementation plan, data/schema changes, error handling, scope boundaries, open questions, test plan, and acceptance criteria. AFTER calling this tool: (1) fill in every [REQUIRED] section, (2) save the completed spec to the file path returned, (3) if Open Questions has anything other than 'None', ask the user before continuing, (4) present the full spec and wait for explicit approval, (5) run /compact, then implement. Only skip this for single-file bug fixes — use complete_task for those instead.",
    {
      name: z.string().describe("Short feature name, e.g. 'stripe-billing', 'dark-mode', 'auth-refresh'"),
      description: z.string().describe("The user's request in their own words — what they want and why"),
    },
    async ({ name, description }) => {
      const result = await planFeature(projectRoot, name, description);
      const warning = result.warning ? `\n\n⚠ ${result.warning}` : "";
      return {
        content: [{
          type: "text",
          text: `Feature spec template written: ${result.path}${warning}\n\n${result.content}\n\n---\nINSTRUCTIONS (follow exactly, do not skip steps):\n1. Fill in every [REQUIRED] section above with real content based on your understanding of the codebase.\n2. Read the file at ${result.path} first (required before writing), then overwrite it with your completed spec using the Write tool.\n3. Check "Open Questions" in your completed spec: if it contains anything other than "None", ask those questions to the user NOW and STOP. Do not continue until you have answers.\n4. Read the file at ${result.path} and output its COMPLETE contents to the user. Your output must include all of these sections by name: What, Why, Architecture, Files to Modify, Files to Create, Data / Schema Changes, Error Handling, Scope Boundaries, Decisions Being Made, Open Questions, Automated Tests, Manual Verification, Acceptance Criteria. Do NOT use a summary table. Do NOT condense or paraphrase any section. Do NOT omit any section. Output every line of the file exactly as written. Then ask: "Does this plan look right? Any changes before I start?"\n5. After the user approves, run /compact to clear planning context before implementing — the spec file persists so nothing is lost.\n6. Do NOT write any code until after the user has approved AND you have run /compact.\n7. When implementation is done, verify ALL acceptance criteria yourself (run tests, check behavior, confirm outputs). Include results for both the feature spec's tests AND matching PLAN.md acceptance criteria in your complete_feature() call.\n8. Call complete_feature("${result.slug}") with all test/AC results. This will check off completed PLAN.md items and auto-archive PLAN.md when all phases are done.`,
        }],
      };
    }
  );

  server.tool(
    "complete_feature",
    "Call this IMMEDIATELY after verifying all acceptance criteria yourself — run every test, check every AC item, do not leave any for the user. This is the final required step of every feature implementation. If you skip this, decisions are lost, docs go stale, and future sessions will have no record of this feature. Logs decisions, updates SPEC.md/DESIGN.md, syncs context, checks off completed items in PLAN.md, auto-archives PLAN.md when all phases are done, and archives the feature spec. Call this INSTEAD OF complete_task when you used plan_feature() to start the work.",
    {
      name: z.string().describe("Feature name matching the active feature spec slug, e.g. 'stripe-billing'"),
      testResults: z.array(z.object({
        item: z.string().describe("Test or acceptance criteria item you verified — include BOTH automated tests and acceptance criteria from the feature spec and PLAN.md"),
        passed: z.boolean().describe("Whether this verification step passed"),
        notes: z.string().optional().describe("Details if failed or noteworthy"),
      })).describe("Results for ALL verification items: automated tests, acceptance criteria from the feature spec, and matching acceptance criteria from PLAN.md. YOU are the tester — verify everything before calling this."),
      decisions: z.array(z.object({
        decision: z.string().describe("What was decided"),
        rationale: z.string().describe("Why, and what alternatives were rejected"),
        topic: z.union([z.string(), z.array(z.string())]).describe("Tags for filtering"),
      })).optional().describe("Architectural choices made during implementation"),
      specUpdates: z.array(z.object({
        section: z.string().describe("Section heading in SPEC.md to update"),
        content: z.string().describe("New content for this section"),
      })).optional().describe("REQUIRED if any feature was added, changed, or removed. Update every relevant section of SPEC.md. Omit only if this feature made zero changes to what the product does."),
      designUpdates: z.array(z.object({
        section: z.string().describe("Section heading in DESIGN.md to update"),
        content: z.string().describe("New content for this section"),
      })).optional().describe("REQUIRED if any UI component, page, button, state, or layout was added or changed. Omit only if zero renderer/UI files were touched."),
    },
    async ({ name, testResults, decisions, specUpdates, designUpdates }) => {
      const normalizedDecisions = decisions?.map((d) => ({ ...d, topic: Array.isArray(d.topic) ? d.topic : [d.topic] }));
      const result = await completeFeature(projectRoot, name, testResults, normalizedDecisions, specUpdates, designUpdates);
      const missingChecks: string[] = [];
      if (!specUpdates || specUpdates.length === 0) missingChecks.push("specUpdates (SPEC.md) — did this feature change what the product does? If yes, you must call update_artifact(\"spec\", ...)");
      if (!designUpdates || designUpdates.length === 0) missingChecks.push("designUpdates (DESIGN.md) — did this feature touch any UI components, buttons, pages, or layouts? If yes, you must call update_artifact(\"design\", ...)");
      const checkMsg = missingChecks.length > 0
        ? `\n\n⚠ You did not provide:\n${missingChecks.map(c => `  - ${c}`).join("\n")}\nReview the above and call update_artifact() for any that apply before this feature is fully logged.`
        : "";
      return { content: [{ type: "text", text: result + checkMsg }] };
    }
  );

  // ── Convenience Tool ──

  server.tool(
    "complete_task",
    "Call this IMMEDIATELY after the code change is made — do not wait for user feedback or confirmation. Bundles all post-task actions into one call: logs your decisions, updates SPEC.md/DESIGN.md, and syncs the project map. This is the single most important tool to call after doing work.",
    {
      summary: z.string().describe("One sentence: what you just built or changed"),
      decisions: z.array(z.object({
        decision: z.string().describe("What was decided"),
        rationale: z.string().describe("Why, and what alternatives were rejected"),
        topic: z.union([z.string(), z.array(z.string())]).describe("Tags for filtering"),
      })).optional().describe("Architectural choices made during this task. Omit if no choices were made."),
      specUpdates: z.array(z.object({
        section: z.string().describe("Section heading in SPEC.md to update"),
        content: z.string().describe("New content for this section"),
      })).optional().describe("SPEC.md sections to update. Include if any features were added, removed, or changed."),
      designUpdates: z.array(z.object({
        section: z.string().describe("Section heading in DESIGN.md to update"),
        content: z.string().describe("New content for this section"),
      })).optional().describe("DESIGN.md sections to update. Include if any UI/pages/components changed."),
    },
    async ({ summary, decisions, specUpdates, designUpdates }) => {
      const normalizedDecisions = decisions?.map((d) => ({ ...d, topic: Array.isArray(d.topic) ? d.topic : [d.topic] }));
      const result = await completeTask(projectRoot, summary, normalizedDecisions, specUpdates, designUpdates);
      return { content: [{ type: "text", text: result }] };
    }
  );

  // ── Coding Mode Pipeline Tools ──

  const CODING_GENERATE_PROMPTS: Record<string, string> = {
    claude: CODING_GENERATE_CLAUDE_PROMPT,
    spec: CODING_GENERATE_SPEC_PROMPT,
    plan: CODING_GENERATE_PLAN_PROMPT,
    design: CODING_GENERATE_DESIGN_PROMPT,
    commands: CODING_GENERATE_COMMANDS_PROMPT,
  };

  server.tool(
    "start_coding_project",
    "Call this when the user wants to start a new project, scaffold an app idea, or generate project context files (CLAUDE.md, SPEC.md, PLAN.md, DESIGN.md). Triggers include: describing an app idea, 'I want to build X', 'new project', 'set up my project files', or any request to scaffold a project from scratch. Call this BEFORE creating any files or writing any code.",
    { idea: z.string().describe("The user's raw app idea or project description") },
    async ({ idea }) => {
      await writeSession(projectRoot, { ideaDump: idea });
      return {
        content: [{
          type: "text",
          text: `Session created. Now execute the following task inline:\n\n## System Prompt\n${CODING_EXTRACT_SYSTEM_PROMPT}\n\n## User Input\n${idea}\n\nRespond with ONLY the JSON object as specified. Then call the tool submit_extraction(result) with your JSON output as a string.`,
        }],
      };
    }
  );

  server.tool(
    "submit_extraction",
    "Submit the extraction result from the coding project analysis step. Called after start_coding_project.",
    { extraction: z.string().describe("The extraction JSON string from the analysis step") },
    async ({ extraction }) => {
      const session = await readSession(projectRoot);
      if (!session) return { content: [{ type: "text", text: "Error: No active coding session. Call start_coding_project first." }] };

      let parsed: CodingExtractionResult;
      try {
        parsed = JSON.parse(extraction) as CodingExtractionResult;
      } catch {
        return { content: [{ type: "text", text: "Error: Invalid JSON. Please re-run the extraction and provide valid JSON." }] };
      }

      session.extraction = parsed;
      await writeSession(projectRoot, session);

      // Always run clarification — lets the user review and override extraction assumptions
      const context = `Idea: ${session.ideaDump}\n\nExtraction: ${JSON.stringify(parsed, null, 2)}`;
      return {
        content: [{
          type: "text",
          text: `Extraction saved (${parsed.assumptions?.length ?? 0} assumption(s) to review). Now execute the following task inline:\n\n## System Prompt\n${CODING_CLARIFY_SYSTEM_PROMPT}\n\n## User Input\n${context}\n\nRespond with ONLY the JSON object as specified. Then call the tool submit_clarification(result) with your JSON output as a string.`,
        }],
      };
    }
  );

  server.tool(
    "submit_clarification",
    "Submit the clarification questions generated for the user. Called after submit_extraction when gaps exist.",
    { questions: z.string().describe("The clarification questions JSON string") },
    async ({ questions }) => {
      const session = await readSession(projectRoot);
      if (!session) return { content: [{ type: "text", text: "Error: No active coding session." }] };

      let parsed: CodingClarificationResult;
      try {
        parsed = JSON.parse(questions) as CodingClarificationResult;
      } catch {
        return { content: [{ type: "text", text: "Error: Invalid JSON. Please provide valid clarification questions JSON." }] };
      }

      session.clarification = parsed;
      await writeSession(projectRoot, session);

      const askUserText = mapQuestionsToAskUser(
        parsed.questions,
        'submit_clarification_answers(answers) — pass a JSON string of [{question: "...", answer: "..."}] pairs'
      );

      return {
        content: [{
          type: "text",
          text: `Clarification questions saved.\n\n${askUserText}`,
        }],
      };
    }
  );

  server.tool(
    "submit_clarification_answers",
    "Submit the user's answers to clarification questions. Called after the user responds to AskUserQuestion.",
    { answers: z.string().describe('JSON string of [{question: "...", answer: "..."}] pairs') },
    async ({ answers }) => {
      const session = await readSession(projectRoot);
      if (!session) return { content: [{ type: "text", text: "Error: No active coding session." }] };

      let parsed: { question: string; answer: string }[];
      try {
        parsed = JSON.parse(answers) as { question: string; answer: string }[];
      } catch {
        return { content: [{ type: "text", text: "Error: Invalid JSON. Please provide valid answer pairs." }] };
      }

      session.clarificationAnswers = parsed;
      await writeSession(projectRoot, session);

      const context = `Idea: ${session.ideaDump}\n\nExtraction: ${JSON.stringify(session.extraction, null, 2)}\n\nClarification Answers:\n${parsed.map(a => `- ${a.question}: ${a.answer}`).join("\n")}`;
      return {
        content: [{
          type: "text",
          text: `Clarification answers saved. Now execute the following task inline:\n\n## System Prompt\n${CODING_RECOMMEND_SYSTEM_PROMPT}\n\n## User Input\n${context}\n\nRespond with ONLY the JSON object as specified. Then call the tool submit_recommendations(result) with your JSON output as a string.`,
        }],
      };
    }
  );

  server.tool(
    "submit_recommendations",
    "Submit the tech stack recommendations. Called after the recommendation step.",
    { recommendations: z.string().describe("The recommendations JSON string with stack categories and options") },
    async ({ recommendations }) => {
      const session = await readSession(projectRoot);
      if (!session) return { content: [{ type: "text", text: "Error: No active coding session." }] };

      let parsed: RecommendationResult;
      try {
        parsed = JSON.parse(recommendations) as RecommendationResult;
      } catch {
        return { content: [{ type: "text", text: "Error: Invalid JSON. Please provide valid recommendations JSON." }] };
      }

      session.recommendations = parsed;
      await writeSession(projectRoot, session);

      // Map stack categories to AskUserQuestion format
      const lines: string[] = [];
      lines.push("Stack recommendations saved. Present the following tech stack choices to the user using AskUserQuestion.\n");
      lines.push("Call AskUserQuestion with the following questions:\n");

      for (let i = 0; i < parsed.stack.length; i++) {
        const cat = parsed.stack[i];
        const recommended = cat.options.find(o => o.recommended);
        lines.push(`Question ${i + 1}:`);
        lines.push(`  question: "${cat.label}: ${cat.why}"`);
        lines.push(`  header: "${cat.label.slice(0, 12)}"`);
        lines.push(`  multiSelect: false`);
        lines.push(`  options:`);
        // Cap at 4 options
        const capped = cat.options.slice(0, 4);
        for (const opt of capped) {
          const rec = opt.recommended ? " (recommended)" : "";
          lines.push(`    - label: "${opt.label}${rec}"`);
          lines.push(`      description: "${opt.description} [${opt.costTier}]"`);
        }
        if (recommended) {
          lines.push(`  default: "${recommended.label}"`);
        }
        lines.push("");
      }

      lines.push('After collecting all answers, call confirm_stack(selections) — pass a JSON string mapping category IDs to selected option labels, e.g. {"frontend": "Next.js", "database": "Supabase"}');

      return { content: [{ type: "text", text: lines.join("\n") }] };
    }
  );

  server.tool(
    "confirm_stack",
    "Confirm the user's tech stack selections. Called after the user picks their stack.",
    { stack: z.string().describe('JSON string mapping category IDs to selected option labels, e.g. {"frontend": "Next.js"}') },
    async ({ stack }) => {
      const session = await readSession(projectRoot);
      if (!session) return { content: [{ type: "text", text: "Error: No active coding session." }] };

      let parsed: Record<string, string>;
      try {
        parsed = JSON.parse(stack) as Record<string, string>;
      } catch {
        return { content: [{ type: "text", text: "Error: Invalid JSON. Please provide a valid stack selections object." }] };
      }

      session.stack = parsed;
      await writeSession(projectRoot, session);

      if (session.extraction?.hasUI) {
        // Has UI — ask UI/design questions
        const brief = formatProjectBrief(session);
        return {
          content: [{
            type: "text",
            text: `Stack confirmed. This project has a UI, so we need design input. Execute the following task inline:\n\n## System Prompt\n${CODING_ASK_UI_SYSTEM_PROMPT}\n\n## User Input\n${brief}\n\nRespond with ONLY the JSON object as specified. Then call the tool submit_ui_questions(result) with your JSON output as a string.`,
          }],
        };
      }

      // No UI — skip to generation
      return {
        content: [{
          type: "text",
          text: "Stack confirmed. No UI detected — skipping design questions. Call generate_project_artifacts() to generate all project files.",
        }],
      };
    }
  );

  server.tool(
    "submit_ui_questions",
    "Submit the UI/design questions generated for the user. Called after confirm_stack when the project has a UI.",
    { questions: z.string().describe("The UI questions JSON string") },
    async ({ questions }) => {
      const session = await readSession(projectRoot);
      if (!session) return { content: [{ type: "text", text: "Error: No active coding session." }] };

      let parsed: CodingUIQuestionsResult;
      try {
        parsed = JSON.parse(questions) as CodingUIQuestionsResult;
      } catch {
        return { content: [{ type: "text", text: "Error: Invalid JSON. Please provide valid UI questions JSON." }] };
      }

      session.uiQuestions = parsed;
      await writeSession(projectRoot, session);

      const askUserText = mapQuestionsToAskUser(
        parsed.questions,
        'submit_ui_answers(answers) — pass a JSON string of [{question: "...", answer: "..."}] pairs'
      );

      return {
        content: [{
          type: "text",
          text: `UI questions saved.\n\n${askUserText}`,
        }],
      };
    }
  );

  server.tool(
    "submit_ui_answers",
    "Submit the user's answers to UI/design questions. Called after the user responds to the UI questions.",
    { answers: z.string().describe('JSON string of [{question: "...", answer: "..."}] pairs') },
    async ({ answers }) => {
      const session = await readSession(projectRoot);
      if (!session) return { content: [{ type: "text", text: "Error: No active coding session." }] };

      let parsed: { question: string; answer: string }[];
      try {
        parsed = JSON.parse(answers) as { question: string; answer: string }[];
      } catch {
        return { content: [{ type: "text", text: "Error: Invalid JSON. Please provide valid answer pairs." }] };
      }

      session.uiAnswers = parsed;
      await writeSession(projectRoot, session);

      return {
        content: [{
          type: "text",
          text: "UI answers saved. Call generate_project_artifacts() to generate all project files.",
        }],
      };
    }
  );

  server.tool(
    "generate_project_artifacts",
    "Generate all project context files (CLAUDE.md, SPEC.md, PLAN.md, DESIGN.md, etc.) based on the completed coding session.",
    {},
    async () => {
      const session = await readSession(projectRoot);
      if (!session) return { content: [{ type: "text", text: "Error: No active coding session." }] };
      if (!session.extraction) return { content: [{ type: "text", text: "Error: No extraction in session. Run the pipeline from start_coding_project." }] };

      const profile = session.extraction.profile;
      const artifacts = getArtifactsForProfile(profile);
      const brief = formatProjectBrief(session);

      const instructions: string[] = [];
      instructions.push(`Generate the following project files. Profile: ${profile}, artifacts: ${artifacts.join(", ")}.\n`);
      instructions.push(`For EACH artifact below, execute the system prompt with the project brief, parse the JSON response to get the "content" field, and write it to the specified file path using the Write tool.\n`);

      for (const artifactType of artifacts) {
        const prompt = CODING_GENERATE_PROMPTS[artifactType];
        if (!prompt) continue;

        let filePath: string;
        switch (artifactType) {
          case "claude": filePath = "CLAUDE.md"; break;
          case "spec": filePath = "SPEC.md"; break;
          case "plan": filePath = "PLAN.md"; break;
          case "design": filePath = "DESIGN.md"; break;
          case "commands": filePath = ".claude/commands/ (write review.md, new-feature.md, pr.md separately)"; break;
          default: continue;
        }

        instructions.push(`---\n### Artifact: ${artifactType} → ${filePath}\n`);
        instructions.push(`## System Prompt\n${prompt}\n`);
        instructions.push(`## User Input (Project Brief)\n${brief}\n`);
        instructions.push(`Execute this prompt, extract the "content" field from the JSON response, and write it to ${filePath}.\n`);

        if (artifactType === "commands") {
          instructions.push(`For commands: parse the content to find the three files (review.md, new-feature.md, pr.md) separated by "---" headers, then write each to .claude/commands/<filename>.\n`);
        }
      }

      instructions.push(`\nAfter ALL files are written, call finalize_project() to complete setup.`);

      return { content: [{ type: "text", text: instructions.join("\n") }] };
    }
  );

  server.tool(
    "finalize_project",
    "Finalize the coding project: inject Living Context into CLAUDE.md, seed decisions, write config, and clean up the session.",
    {},
    async () => {
      const session = await readSession(projectRoot);
      if (!session) return { content: [{ type: "text", text: "Error: No active coding session." }] };

      const results: string[] = [];

      // 1. Inject Living Context into CLAUDE.md
      try {
        await injectClaudeMdLivingContext(projectRoot);
        results.push("✓ Injected Living Context block into CLAUDE.md");
      } catch (err) {
        results.push(`✗ Failed to inject Living Context: ${err}`);
      }

      // 2. Seed decisions from stack selections
      if (session.stack) {
        const decisions = Object.entries(session.stack)
          .filter(([, v]) => v && v !== "not_sure")
          .map(([category, choice], i) => ({
            id: `seed-${String(i + 1).padStart(3, "0")}`,
            decision: `Using ${choice} for ${category}`,
            rationale: "Selected during project setup in Alchemist Coding Mode.",
            topic: [category],
            madeAt: new Date().toISOString(),
            source: "alchemist-coding-mode",
          }));
        await writeDecisions(projectRoot, decisions);
        results.push(`✓ Seeded ${decisions.length} decision(s) from stack selections`);
      }

      // 3. Write config
      const projectName = session.extraction?.intent?.split(/\s+/).slice(0, 3).join("-").toLowerCase().replace(/[^a-z0-9-]/g, "") || "my-project";
      const config: AlchemistConfig = {
        version: "1.0.0",
        projectName,
        alchemistVersion: "0.1.0",
        ignorePatterns: ["node_modules", ".next", "dist", "build", "*.lock"],
        tagRules: {},
        watchDebounceMs: 10000,
        maxRecentChanges: 10,
        stack: session.stack,
      };
      await writeConfig(projectRoot, config);
      results.push("✓ Wrote .alchemist/config.json");

      // 4. Init empty failures store
      await writeFailures(projectRoot, []);
      results.push("✓ Initialized empty failures store");

      // 5. Auto-register generated artifacts
      const artifactsToRegister: { path: string; purpose: string }[] = [
        { path: "SPEC.md", purpose: "Product specification — requirements, features, and acceptance criteria" },
        { path: "PLAN.md", purpose: "Phased build plan — implementation phases, tasks, and completion checklist" },
      ];
      if (session.extraction?.hasUI) {
        artifactsToRegister.push({ path: "DESIGN.md", purpose: "UI and component design spec" });
      }
      for (const artifact of artifactsToRegister) {
        try {
          await addDocument(projectRoot, artifact.path, artifact.purpose);
        } catch {
          // Non-fatal — don't block project finalization
        }
      }
      results.push(`✓ Registered ${artifactsToRegister.length} artifact(s) in document registry`);

      // 6. Delete session file
      await clearSession(projectRoot);
      results.push("✓ Cleaned up .alchemist/.coding-session.json");

      const artifactList = session.extraction
        ? getArtifactsForProfile(session.extraction.profile).map(a => {
            switch (a) {
              case "claude": return "CLAUDE.md";
              case "spec": return "SPEC.md";
              case "plan": return "PLAN.md";
              case "design": return "DESIGN.md";
              case "commands": return ".claude/commands/";
              default: return a;
            }
          }).join(", ")
        : "project files";

      return {
        content: [{
          type: "text",
          text: `Project setup complete!\n\n${results.join("\n")}\n\nGenerated files: ${artifactList}\n\nThe project is ready. You can now start implementing Phase 1 from PLAN.md. Call get_briefing() at the start of your next session.`,
        }],
      };
    }
  );

  return server;
}
