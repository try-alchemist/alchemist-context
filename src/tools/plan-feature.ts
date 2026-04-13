import { readDecisions, filterDecisionsByTopic } from "../store/decisions.js";
import { readContext } from "../store/context.js";
import { listArchivedFeatures, writeActiveFeature, getActiveFeature } from "../store/features.js";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function buildFeatureSpec(
  name: string,
  slug: string,
  description: string,
  context: {
    relatedDecisions: { decision: string; rationale: string }[];
    relatedFiles: { path: string; purpose: string }[];
    relatedArchived: { name: string; path: string }[];
  }
): string {
  const decisionsSection = context.relatedDecisions.length > 0
    ? context.relatedDecisions.map((d) => `- Existing decision: ${d.decision}\n  Rationale: ${d.rationale}`).join("\n")
    : "- No related decisions found — make sure to log any choices via the decisions params in complete_feature()";

  const archivedSection = context.relatedArchived.length > 0
    ? context.relatedArchived.map((a) => `- [${a.name}](${a.path})`).join("\n")
    : "- None";

  const relatedFilesSection = context.relatedFiles.length > 0
    ? context.relatedFiles.slice(0, 8).map((f) => `- \`${f.path}\` — ${f.purpose}`).join("\n")
    : "- (run get_project_map with a relevant scope to identify files)";

  return `# Feature: ${name}
Created: ${new Date().toISOString().split("T")[0]}

## What
**[REQUIRED]:** Write one paragraph describing what this feature does from the user's perspective.

## Why
${description}

## How

### Architecture
**[REQUIRED]:** Describe the high-level approach. Which existing patterns does this follow? Which systems does it integrate with?

### Existing Context
${decisionsSection}

### Related Past Features
${archivedSection}

### Potentially Relevant Files
${relatedFilesSection}

### Files to Modify
**[REQUIRED]:** List every file that will change. For each: \`path\` — what specifically changes and why.

### Files to Create
**[REQUIRED]:** List every new file. For each: \`path\` — its purpose. Write "None" if no new files.

### Data / Schema Changes
**[REQUIRED]:** Describe any DB schema changes, new fields, or migrations. Write "None" if not applicable.

### Error Handling
**[REQUIRED]:** How is each failure mode handled? Cover: network errors, LLM timeouts, invalid input, empty responses.

### Scope Boundaries
**[REQUIRED]:** What does this feature explicitly NOT do? List at least one boundary to prevent scope creep.

### Decisions Being Made
**[REQUIRED]:** What architectural choices are you making? Include rationale and alternatives rejected.

## Open Questions
**[REQUIRED]:** List anything unclear from the user's request that would change the implementation. Write "None" if everything is clear. If not "None", you MUST ask the user these questions before implementing.

## Automated Tests
**[REQUIRED]:** List tests Claude can run programmatically — unit tests, mocked integration tests. These are the only tests Claude needs to pass before calling complete_feature. For each: what to run and what the expected result is.
- [ ]
- [ ]

## Manual Verification
**[REQUIRED]:** List steps that require user action — running the real app, external services, visual checks, end-to-end flows. Claude will output these as a checklist when completing the feature. Write "None" if everything can be automated.
- [ ]

## Acceptance Criteria
**[REQUIRED]:** List specific user-visible behaviors that confirm the feature is complete.
-
-

---
*Fill in every [REQUIRED] section above before presenting to the user.*
`;
}

export interface PlanFeatureResult {
  slug: string;
  path: string;
  content: string;
  warning?: string;
}

export async function planFeature(
  projectRoot: string,
  name: string,
  description: string
): Promise<PlanFeatureResult> {
  const slug = slugify(name);

  // Warn if there's already an active feature
  const existing = await getActiveFeature(projectRoot);
  const warning = existing
    ? `Warning: There is already an active feature ("${existing.name}"). Complete or abandon it before starting a new one. Active spec: ${existing.path}`
    : undefined;

  // Gather context for the spec
  const allDecisions = await readDecisions(projectRoot);
  // Use first word of name as a rough scope hint
  const scopeHint = slug.split("-")[0];
  const relatedDecisions = filterDecisionsByTopic(allDecisions, scopeHint)
    .slice(-5)
    .map((d) => ({ decision: d.decision, rationale: d.rationale }));

  const ctx = await readContext(projectRoot);
  const relatedFiles = ctx
    ? ctx.files
        .filter((f) => f.tags.some((t) => t.toLowerCase().includes(scopeHint)))
        .slice(0, 8)
        .map((f) => ({ path: f.path, purpose: f.purpose }))
    : [];

  const allArchived = await listArchivedFeatures(projectRoot);
  const relatedArchived = allArchived
    .filter((a) => a.name.toLowerCase().includes(scopeHint))
    .slice(0, 3)
    .map((a) => ({ name: a.name, path: a.path }));

  const content = buildFeatureSpec(name, slug, description, {
    relatedDecisions,
    relatedFiles,
    relatedArchived,
  });

  await writeActiveFeature(projectRoot, slug, content);

  return {
    slug,
    path: `.alchemist/features/active/${slug}.md`,
    content,
    warning,
  };
}
