# Alchemist — Living Context for Claude Code

**Claude forgets everything between sessions. Alchemist fixes that.**

Alchemist is an MCP server that gives Claude Code persistent memory, enforced workflow, and the ability to scaffold a new project from a plain-English idea — in one command.

```bash
npx @alchemist/context init
```

---

## The problem

Every time you open Claude Code, it starts from zero. It re-reads your files, re-discovers your architecture, re-debates decisions you already made, and re-tries approaches that already failed. A one-hour session wastes the first 20 minutes on rediscovery.

On bigger projects it gets worse. Claude misremembers which library you chose, ignores the constraint you told it about last week, and confidently suggests the exact approach you both agreed didn't work.

---

## What Alchemist does

**Persistent memory.** Every architectural decision, every failed approach, every active feature — logged and loaded automatically at the start of each session. Claude starts oriented, not amnesiac.

**Enforced workflow.** A `PreToolUse` hook blocks Claude from touching your files until it reads the briefing. No more sessions where Claude dives straight into code before understanding the project state.

**Project scaffolding.** Describe your app in plain English. Alchemist guides you through clarification, stack selection, and design questions — then generates `SPEC.md`, `PLAN.md`, `DESIGN.md`, `CLAUDE.md`, and starter slash commands. Open Claude Code and say "build phase 1."

**Document registry.** Every markdown file you create gets logged with a one-sentence purpose. No more orphaned specs cluttering your root. Claude can find your architecture doc, your auth spec, or your redesign plan by description — without reading every file.

---

## Demo

> *GIF: Coding Mode — idea to scaffolded project in under 2 minutes*
> *(coming soon)*

---

## Install

Requires [Claude Code](https://claude.ai/code) and Node.js 18+.

```bash
npx @alchemist/context init
```

That's it. Init scans your project, writes `.mcp.json` and `.cursor/mcp.json`, installs a git post-commit hook, and injects the Living Context instructions into your `CLAUDE.md`. Restart Claude Code and the tools are live.

---

## Two ways to start

### Starting a new project from an idea

Open your terminal in an empty folder and run:

```bash
mkdir my-app && cd my-app
npx @alchemist/context init
```

Then open Claude Code and say:

> "I want to build a subscription management dashboard for SaaS founders"

Claude will call `start_coding_project()`, walk you through clarifying questions, recommend a tech stack, ask about your UI preferences, and generate your full project foundation:

```
SPEC.md          — requirements, features, acceptance criteria
PLAN.md          — phased build plan, ready to execute
DESIGN.md        — UI spec and component inventory
CLAUDE.md        — conventions + living context instructions
.claude/commands — starter slash commands (review, new-feature, pr)
.alchemist/      — living context store
```

Tell Claude to "read the project files and build phase 1." It knows exactly where to start.

### Adding Alchemist to an existing project

```bash
cd your-project
npx @alchemist/context init
```

Alchemist scans your codebase, detects your stack and dependencies, maps your file structure, and seeds a project context. Your next Claude Code session starts with a full project briefing instead of a blank slate.

---

## How it works

Alchemist injects a `## Living Context (Alchemist)` section into your `CLAUDE.md` with mandatory tool-call instructions. It also installs a `PreToolUse` hook that blocks Claude from touching your files until it reads the briefing — every session, automatically.

**At session start, Claude calls four tools in order:**

```
get_briefing()       → recent commits, artifact freshness, active feature, known failures
get_project_map()    → scoped file map with exports, imports, and detected patterns
get_decisions()      → logged architectural decisions (filtered by topic if needed)
get_failures()       → failed approaches with workarounds, so Claude doesn't retry them
```

**During work:**

```
log_decision()       → "we chose Drizzle over Prisma because of edge deployment"
log_failure()        → "Prisma fails on Cloudflare Workers — workaround: use Drizzle"
plan_feature()       → generates a structured spec template before any code is written
complete_feature()   → archives the spec, checks off PLAN.md, logs decisions
complete_task()      → quick post-task log for small changes
register_doc()       → logs any .md file you create with a one-sentence purpose
find_docs()          → finds project docs by description, not filename
```

**Automatically in the background:**

- Git post-commit hook syncs the project map after every commit
- File watcher keeps context fresh during active work
- `get_briefing()` warns when context is stale or specs are out of date

---

## What Claude remembers

Everything Alchemist tracks lives in `.alchemist/` — plain JSON files, committed alongside your code.

| File | What it stores |
|---|---|
| `decisions.json` | Architectural choices with rationale — why you chose this library, this pattern, this approach |
| `failures.json` | Dead ends with reasons and workarounds — approaches Claude tried and you should never retry |
| `context.json` | Project map — file purposes, exports, imports, dependencies, recent commits |
| `documents.json` | Registry of project markdown files — path, purpose, status, staleness |
| `features/active/` | In-progress feature specs |
| `features/archive/` | Completed specs with timestamps |

No cloud. No API keys. No Docker. Just files in your repo.

---

## Tool reference

### Session start (call first, every session)

| Tool | Parameters | Returns |
|---|---|---|
| `get_briefing()` | — | Project state: recent commits, artifact status, active feature, known failures, recent decisions, document summary |
| `get_project_map(scope?)` | scope: optional domain filter ("auth", "ui", "api") | Filtered file map with exports, imports, tags, and detected patterns |
| `get_decisions(topic?)` | topic: optional keyword filter | Logged architectural decisions |
| `get_failures(topic?)` | topic: optional keyword filter | Failed approaches with reasons and workarounds |

### Logging (call after every meaningful action)

| Tool | Parameters | When to call |
|---|---|---|
| `log_decision(decision, rationale, topic)` | decision: what you chose; rationale: why; topic: string[] | After choosing between options — library, pattern, architecture |
| `log_failure(approach, reason, topic, workaround?)` | approach: what was tried; reason: why it failed; topic: string[] | Before trying a different approach |
| `update_artifact(artifact, section, content)` | artifact: "spec"\|"design"; section: heading name; content: new text | After any change that affects your spec or design doc |
| `sync_context()` | — | After creating 3+ new files or a major refactor |

### Feature workflow

| Tool | Parameters | When to call |
|---|---|---|
| `plan_feature(name, description)` | name: slug; description: what was asked for | Before reading any implementation files or writing any code |
| `complete_feature(name, testResults, ...)` | name: feature slug; testResults: [{item, passed, notes}] | After all acceptance criteria are verified |
| `complete_task(summary, ...)` | summary: one sentence | After any code change that doesn't warrant a full feature spec |

### Document registry

| Tool | Parameters | When to call |
|---|---|---|
| `register_doc(path, purpose, relatedFeature?)` | path: relative file path; purpose: one sentence | Immediately after creating any .md file |
| `find_docs(query)` | query: keyword or phrase | Before creating a new doc, or when looking for prior context |
| `archive_doc(path, reason)` | path: relative file path; reason: why archiving | When a doc's work is complete or it's been superseded |

### Project scaffolding (Coding Mode)

| Step | Tool | What happens |
|---|---|---|
| 1 | `start_coding_project(idea)` | Extracts intent, profile, platform, and gaps from your idea |
| 2 | `submit_extraction(json)` | Saves extraction; surfaces clarifying questions if needed |
| 3 | `submit_clarification_answers(answers)` | Saves answers; triggers stack recommendation |
| 4 | `submit_recommendations(json)` | Presents stack options for your selection |
| 5 | `confirm_stack(selections)` | Locks in your tech stack |
| 6 | `submit_ui_answers(answers)` | (UI projects) Captures design preferences |
| 7 | `generate_project_artifacts()` | Generates all project files |
| 8 | `finalize_project()` | Injects Living Context, seeds decisions, cleans up |

---

## What your sessions look like

**Before Alchemist**

```
You:    Add Stripe webhooks
Claude: [reads 12 files to understand the project structure]
        [suggests using the auth library you deprecated two weeks ago]
        [tries the webhook signature approach that failed last session]
        [asks you to re-explain how your API routes are structured]
```

**After Alchemist**

```
You:    Add Stripe webhooks
Claude: [calls get_briefing — knows you use Supabase, the active feature is "payments",
         and that raw body parsing failed last time with a note on the workaround]
        [calls get_project_map("payments") — sees exactly which files to touch]
        [calls plan_feature("stripe-webhooks", ...) — writes a spec before touching code]
        [implements without re-asking what you already told it]
```

---

## What gets committed

```
your-project/
├── .alchemist/
│   ├── config.json        ← project metadata
│   ├── context.json       ← auto-updated file map
│   ├── decisions.json     ← architectural log
│   ├── failures.json      ← dead ends log
│   ├── documents.json     ← doc registry
│   └── features/
│       ├── active/        ← in-progress specs
│       └── archive/       ← completed specs
├── .mcp.json              ← Claude Code MCP config
├── CLAUDE.md              ← conventions + living context instructions
├── SPEC.md                ← (if generated by Coding Mode)
├── PLAN.md                ← (if generated by Coding Mode)
└── DESIGN.md              ← (if generated by Coding Mode)
```

Commit `.alchemist/` with your project. Decisions, failures, and feature history travel with the repo — useful for teammates and for your future self.

---

## CLI

```bash
# Set up Alchemist in a project (existing or new)
npx @alchemist/context init

# Manually sync the project context (file map, dependencies, recent commits)
npx @alchemist/context sync

# Start the MCP server (Claude Code calls this automatically via .mcp.json)
npx @alchemist/context serve
```

---

## Frequently asked questions

**Does this send my code anywhere?**
No. Everything runs locally. The MCP server reads and writes files in `.alchemist/`. No telemetry, no cloud sync, no API keys required.

**Does it work with Cursor?**
Init writes `.cursor/mcp.json` automatically. The same tools are available in any MCP-compatible client.

**What if I already have a CLAUDE.md?**
Alchemist appends a `## Living Context (Alchemist)` section to the bottom. It never overwrites your existing content.

**What if I don't use git?**
The post-commit hook won't do anything, but all other features work normally. You can run `npx @alchemist/context sync` manually to refresh the project map.

**My project is huge — will context.json get bloated?**
The scanner respects ignore patterns (`node_modules`, `dist`, `build`, `.git`, lockfiles). You can add custom ignore patterns in `.alchemist/config.json`. The context is a structured map of relevant source files, not a dump of everything.

**Can I use this on a project mid-build?**
Yes — that's Journey B. `init` scans your existing codebase and seeds the project map. You start logging decisions and failures from that point forward.

---

## Roadmap

- [x] Living Context (briefing, project map, decisions, failures)
- [x] Feature lifecycle (plan, complete, archive)
- [x] Coding Mode (idea → scaffolded project)
- [x] Document registry
- [ ] Auto-capture (hooks that log decisions/failures without manual calls)
- [ ] Semantic search over decisions and failures
- [ ] Contradiction detection
- [ ] Dashboard

---

## License

MIT — free to use, modify, and distribute.

Pro features (auto-capture, semantic search, contradiction detection) are available as a separate `@alchemist/pro` package.

---

*Built for [Claude Code](https://claude.ai/code). Works with any MCP-compatible client.*
