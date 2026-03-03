# CLAUDE.md

This file provides guidance to Claude Code and agents working on this repository.

## Project Overview

`@stepdown/analyzer` — A TypeScript AST analyzer and fixer that enforces the stepdown rule: callers appear ABOVE callees (high-level first, low-level last). Also detects nested function declarations that appear before logic within a scope.

## Project Conventions

- Each analysis (violation type) must have a fix implementation. Add fixture in `src/violation-coverage.ts` and ensure fix reduces violations.
- Use bun instead of node.
    - `npm run` > `bun run`
    - `npx` > `bunx`
- No Barrel Files. Import directly from source files.
    - ❌ DON'T: `import { foo } from "./index"` or `import { foo } from "./folder"`
    - ✅ DO: `import { foo } from "./folder/foo"`
- Use Mermaid for diagrams.
- Do not fix unused functions or parameters with underscores — delete them.

## Commands

```bash
bun install              # install dependencies
bun test                 # run all tests
bun test tests/fixer.test.ts              # run a single test file
bun test --test-name-pattern "reorders"   # run tests matching pattern
bun run build            # build (scripts/build.ts + tsc declarations)
bun run dev              # run CLI from source
bun run typecheck        # tsc --noEmit
bun run check            # biome check (lint + format)
bun run fix              # biome check --write (auto-fix)
bun run vet              # full pipeline: build → typecheck → biome fix → custom-hooks → test:coverage
```

## Architecture

### Two-rule system
The analyzer has two violation rules registered via a plugin registry (`src/registry.ts`):
- **stepdown** (`src/stepdown-rule.ts`): callers must appear before callees at module scope
- **nested** (`src/nested-rule.ts`): within a function body, logic comes before nested function declarations

Rules implement `ViolationRule` interface from `src/rule-context.ts`. Both rules delegate to functions in `src/analyzer.ts`.

### Analysis → Fix pipeline
1. `FileService` (`src/services/FileService.ts`) resolves globs, reads files, parses with TypeScript compiler API
2. `buildRuleContext` (`src/analyzer.ts`) builds call graphs and function metadata into a `RuleContext`
3. Rules run against the `RuleContext` to produce `Violation[]`
4. `analyzeParsedFile` assembles `AnalysisResult` (violations + circular deps)
5. Fixer (`src/fixer.ts`) uses topological sort via `src/graph-algorithms.ts` to reorder functions

### Shared AST infrastructure
- `src/ast-graph-builder.ts` — call graph construction, dependency extraction
- `src/ast-node-visitors.ts` — node categorization (imports, exports, functions, other)
- `src/ast-utils.ts` — predicate helpers for AST nodes
- `src/graph-algorithms.ts` — topological sort, cycle detection

### CLI
`src/cli.ts` uses CommanderJS with two subcommands: `analyze` (default) and `fix`.

## Test Fixtures

`fixtures/` contains purpose-built `.ts` files that exercise specific violation patterns (circular deps, factory methods, nested functions, DI containers, etc.). Each fixture file has a header comment explaining the pattern it tests.

<!-- bv-agent-instructions-v1 -->

---

## Beads Workflow Integration

This project uses [beads_viewer](https://github.com/Dicklesworthstone/beads_viewer) for issue tracking. Issues are stored in `.beads/` and tracked in git.

### Essential Commands

```bash
# View issues (launches TUI - avoid in automated sessions)
bv

# CLI commands for agents (use these instead)
bd ready              # Show issues ready to work (no blockers)
bd list --status=open # All open issues
bd show <id>          # Full issue details with dependencies
bd create --title="..." --type=task --priority=2
bd update <id> --status=in_progress
bd close <id> --reason="Completed"
bd close <id1> <id2>  # Close multiple issues at once
bd sync               # Commit and push changes
```

### Workflow Pattern

1. **Start**: Run `bd ready` to find actionable work
2. **Claim**: Use `bd update <id> --status=in_progress`
3. **Work**: Implement the task
4. **Complete**: Use `bd close <id>`
5. **Sync**: Always run `bd sync` at session end

### Key Concepts

- **Dependencies**: Issues can block other issues. `bd ready` shows only unblocked work.
- **Priority**: P0=critical, P1=high, P2=medium, P3=low, P4=backlog (use numbers, not words)
- **Types**: task, bug, feature, epic, question, docs
- **Blocking**: `bd dep add <issue> <depends-on>` to add dependencies

### Session Protocol

**Before ending any session, run this checklist:**

```bash
git status              # Check what changed
git add <files>         # Stage code changes
bd sync                 # Commit beads changes
git commit -m "..."     # Commit code
bd sync                 # Commit any new beads changes
git push                # Push to remote
```

### Best Practices

- Check `bd ready` at session start to find available work
- Update status as you work (in_progress → closed)
- Create new issues with `bd create` when you discover tasks
- Use descriptive titles and set appropriate priority/type
- Always `bd sync` before ending session

<!-- end-bv-agent-instructions -->

## Agent Toolkit

### bv — Bead Triage (read-only, use robot flags only)
```bash
bv --robot-triage --format toon | toon -d   # Full triage: priority, health, quick wins
bv --robot-next --format toon | toon -d     # Single top pick
bv --robot-insights --format toon | toon -d # Graph metrics + cycle detection
bv --robot-plan --format toon | toon -d     # Parallel execution tracks
```
Never run bare `bv` — it opens an interactive TUI that blocks the session.

### bd — Beads Issue Tracker
```bash
bd ready --json                             # Next unblocked issue
bd create "<title>" --type bug --priority p0 --label security --json
bd update <id> --status in_progress --json
bd close <id> --reason "Completed" --json
bd list --json
```

### toon — Token-Optimized Output
Pipe any `--robot-*` output through `toon -d` to decode token-efficient format back to JSON.
Add `--format toon` to bv commands; pipe to `toon -d` before passing to tools.

### ms — Skill Discovery
```bash
ms suggest --machine --cwd .               # Load context-relevant skills before starting
ms search "<query>" -m                     # Find skills by intent
ms load "<skill-name>"                     # Load a skill
```
Always run `ms suggest` at session start before implementing anything novel.

### cass — Session Search
```bash
cass search "<query>" --json --limit 5     # Find prior solutions
cass status                                # Index health check
```
Search before implementing to surface prior work from past sessions.

### gh — GitHub CLI
```bash
gh issue list --state open --json number,title,labels
gh pr create --title "<title>" --body "<body>"
gh pr view <number> --json state,reviews,checks
```

### ubs — Security Scanner
```bash
ubs --format=json --diff .                 # Scan only changed files (fast, for pre-commit)
ubs --format=json .                        # Full scan
ubs --staged                               # Scan staged files only
```
Run `ubs --diff` before every commit. Convert critical/high findings to P0/P1 beads.
