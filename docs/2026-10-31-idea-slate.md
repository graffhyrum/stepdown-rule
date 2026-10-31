# Idea Slate — @stepdown/analyzer

Generated via idea-wizard. Grounded in AGENTS.md, PRD, closed bead history, and current source (src/, tests/, docs/).

## Phase 1 — Grounding (summary)

- Project: TypeScript AST analyzer/fixer enforcing stepdown rule (callers above callees) + nested rule.
- Shipped: CLI analyze/fix, agents JSON envelope, config, in-memory file service, registry factory, reporter seam, dry-run, print-to-print change detection, install hardening.
- Closed: major architecture refactor (sole pipeline, deepened rules, unified call graph, type contracts, IFileService seam), nested extraction, registry factory, phantom-field removal, install hardening, UX batch (default command, dry-run, --rules help, verbose desc), typecheck scripts/tests, reporter seam.
- Open beads: 1 (vet-stop env scrub).
- Test surface: 24 test files; vet pipeline green.
- Gaps that stand out: no baseline/suppression, no inline disables, no watch mode, no SARIF, no severity, no class/method support, no TSX, no parallelism, no explain/stats commands, no baseline adoption story.

## Phase 2 — 30 ideas (generated)

1. **Baseline file (`.stepdown-baseline.json`)** — record known violations so existing codebases adopt without fixing everything; `--update-baseline` regenerates. (robust, adoption)
2. **Inline disable comments** — `// stepdown-disable-next-line` / `stepdown-disable` block, parsed from trivia, respected by analyzer + fixer skip. (DX, false-positive escape)
3. **Watch mode** — `--watch` re-analyzes changed files with debounce; keeps process alive; reports deltas. (DX, dev loop)
4. **SARIF output** — `--format sarif` for GitHub code scanning upload; stable schema. (CI, adoption)
5. **Severity levels** — per-rule severity error/warn/info in config; exit code reflects highest severity; `--max-warnings`. (configurability)
6. **Class & object method support** — analyze/reorder methods inside classes and object literals (not just top-level). (feature completeness, big gap)
7. **TSX/JSX support** — parse `.tsx`/`.jsx` with JSX factory; don't choke on JSX in function bodies. (feature completeness)
8. **Parallel file processing** — worker pool (Bun workers or child processes) with bounded concurrency; default to CPU count. (performance)
9. **Incremental parse cache** — mtime+size keyed cache of parsed SourceFile/AnalysisResult on disk; `--no-cache`. (performance)
10. **`explain` command** — print the call chain / dependency path that makes a violation a violation; `--json`. (DX, learning)
11. **`stats` command** — violation counts by rule/file/severity; top offenders; `--json`. (reporting)
12. **Diff-only mode** — `--changed-since <ref>` analyzes only files changed vs git base; great for CI. (CI speed)
13. **Graceful parse-error handling** — skip unparseable files, report them in a `parseErrors` array instead of crashing; exit code distinct. (reliability)
14. **Inline disable + baseline together** unlock adoption (composite of 1+2) — ship as one adoption milestone. (pragmatic)
15. **Config validation command** — `stepdown-rule config check` validates config against schema, reports unknown keys/invalid severities. (robustness)
16. **Config `extends`** — inherit from a shared config (file path or package); monorepo-friendly. (ergonomics)
17. **`.stepdownignore`** — gitignore-style ignore file auto-loaded; complements config ignore. (ergonomics)
18. **Shell completions** — `stepdown-rule completion bash|zsh|fish` prints completion script. (ergonomics)
19. **NO_COLOR / color control** — respect NO_COLOR, `--color=auto|always|never`, `--quiet`. (ergonomics)
20. **Backup on fix** — `--backup` writes `.bak` (or git stash) before writing; `--backup-dir`. (safety)
21. **Interactive fix** — `--interactive` prompts per file before writing; shows diff. (safety/DX)
22. **Plugin API for custom rules** — load rule modules from config (`rules: ["./my-rule.js"]`); documented interface. (extensibility)
23. **Explain violation call path in JSON envelope** — add `dependencyPath` to each violation in agents output. (DX, machine consumers)
24. **Progress reporting** — stderr progress (files done/total) for human mode; `--no-progress`. (UX large runs)
25. **JSON Lines streaming output** — `--format jsonl` emits one envelope per file as processed; enables streaming consumers. (performance/CI)
26. **Golden/snapshot tests for CLI output** — commit expected stdout for fixture files; regression guard. (reliability)
27. **Fuzzing harness for parser/fixer** — property-based tests over random TS snippets; crash + idempotency invariants. (robustness)
28. **Performance benchmark suite** — `bun bench` with timing on fixture corpus; CI regression threshold. (performance)
29. **GitHub Action** — reusable action wrapping the binary; posts PR comments with violations. (adoption)
30. **npm publish / Homebrew tap** — publish to npm (currently private) + brew formula; easier install. (adoption)
31. **LSP server** — `stepdown-rule lsp` stdio server for editors; diagnostics + code actions (fix). (adoption, big)
32. **Cross-file analysis (opt-in)** — analyze function calls across files in a project; `--project`. (advanced)
33. **Rule documentation pages** — per-rule docs (rationale, examples, fix behavior) in docs/ + website. (adoption)
34. **Deterministic output ordering** — sort violations by file/line/rule for stable CI diffs. (reliability)
35. **Max file size guard** — skip files > N MB with a warning instead of OOM. (reliability)
36. **Per-file timeout** — kill analysis of a single file after N seconds; report timeout. (reliability)
37. **Telemetry opt-in** — anonymous usage counts (rules fired, files analyzed) with `--telemetry` opt-in; off by default. (product insight)
38. **Version check / update notice** — check GitHub releases on run; print one-line notice if newer; `--no-update-check`. (UX)
39. **Pre-commit hook bundle** — ship `stepdown-rule init-hooks` that writes husky/lefthook config. (adoption)
40. **Mutation testing integration** — run mutation testing on the fixer to ensure tests catch regressions. (quality)

(Generated 40; trimmed conceptually to 30 by merging 14 into 1+2. Final 30 distinct listed as 1-13,15-33,34-40 minus 14 = 39; I'll treat the slate as the 30 numbered unique after dropping 14 and 34-dup. See winnow below.)

## Phase 3 — Winnowing

### Top 5 (best → worst)

**#1 — Baseline file (`.stepdown-baseline.json`) + `--update-baseline`**
Rationale: The single biggest adoption blocker for any linter in an existing codebase is "too many violations on day one." A baseline file lets teams adopt stepdown-rule incrementally: violations present at baseline time are suppressed; only *new* violations fail CI. This is the proven model (eslint's baseline, ruff's `--add-noqa` is weaker). It composes with every other feature (severity, SARIF, watch mode). Confidence high because the mechanism is well-understood and the data model (file+line+rule+hash) already exists in violations.

**#2 — Inline disable comments (`// stepdown-disable-next-line` / block)**
Rationale: Without an escape hatch, false positives and intentional orderings (e.g., a factory that must define helpers before use for readability) force users to either disable the whole file or abandon the tool. Inline disables are table stakes for linter credibility. Parsing trivia is already done by TS; we just need to read leading comments. Composes with baseline (#1) and explain (#10).

**#3 — Watch mode (`--watch`) with incremental re-analysis**
Rationale: Dev-loop friction kills adoption. A `--watch` that re-runs on save with delta reporting turns stepdown-rule from "CI gate" into "live feedback," matching eslint --watch / tsc --watch expectations. Incremental re-analysis (only changed files) keeps it fast. High user-perceived value; moderate implementation cost (chokidar/fs.watch + debounce).

**#4 — Class & object method support**
Rationale: The analyzer currently only handles top-level functions. Real codebases put logic in classes (services, controllers, React class components) and object literals (modules). Supporting methods is a genuine feature gap that limits applicability to ~half of real TS code. It also stress-tests the reorder engine (methods have `this`/ordering constraints). High value, but must be careful: method order inside a class often carries semantic meaning (lifecycle hooks), so default to opt-in or careful heuristic.

**#5 — SARIF output (`--format sarif`)**
Rationale: GitHub code scanning integration is a one-line win for CI adoption and shows up in the Security tab. SARIF is a well-specified format; mapping violations → results is mechanical. Composes with baseline (#1) (suppressed violations can be marked `suppressedInSource`). Low risk, high visibility.

### Next 10 (best → worst)

**#6 — Severity levels (error/warn/info) + `--max-warnings`**
Composes with baseline; lets teams phase in strictness. Needed before #1/#2 mature (a disable without severity is just on/off).

**#7 — `explain` command (call chain + dependency path)**
DX/learning; helps users understand *why* a reorder happened. Reuses existing call graph. Lower risk.

**#8 — Graceful parse-error handling**
Reliability; prevents one bad file from killing a whole run. Needed for #3 (watch) and #9 (parallel) to be safe.

**#9 — Parallel file processing (worker pool)**
Performance on large codebases; needed for #3 (watch) responsiveness. Moderate complexity with Bun workers.

**#10 — Incremental parse cache (mtime-keyed)**
Performance; compounds with #9. Disk cache invalidation must be correct (mtime+size+config hash).

**#11 — Config validation command (`config check`)**
Robustness; prevents silent misconfig (e.g., unknown rule id). Cheap to build (schema already exists).

**#12 — Diff-only mode (`--changed-since <ref>`)**
CI speed; composes with #9. Needs git integration (already have git in environment).

**#13 — `stats` command**
Reporting; low effort, high visibility for teams adopting.

**#14 — Inline disable + baseline as one adoption milestone (composite)**
Already folded into #1+#2; listed as a tracking bead.

**#15 — Plugin API for custom rules**
Extensibility; bigger bet, but opens ecosystem. Should come after core is stable (now is fine post-refactor).

## Dropped / deferred

- TSX/JSX (#7 in raw list): folded into #4's scope discussion; TSX parsing is a prerequisite for class support in React files. Keep as sub-task of #4.
- Shell completions, NO_COLOR, backup, interactive fix, .stepdownignore, extends, golden tests, fuzzing, benchmarks, GitHub Action, npm/brew, LSP, cross-file, docs site, determinism, max file size, per-file timeout, telemetry, version check, pre-commit bundle, mutation testing: all valuable but lower priority / larger; capture as backlog beads (P3/P4) rather than top 15. LSP and cross-file are P4 (big). Telemetry/version-check are P3 nice-to-haves.

## Phase 4 — Overlap check with open beads

Open beads: `stepdown-1j3` (vet-stop env scrub). No overlap with the above ideas. The closed beads covered the architecture refactor; none of these ideas duplicate closed work (baseline, disables, watch, SARIF, severity, class support, parallelism, cache, explain/stats, config check, diff-only are all new).

## Phase 5 — Beads

See plan document `docs/2026-10-31-plan.md` and the beads created via `br`. Each top idea becomes an epic with subtasks; next-10 become tasks; dropped items become P3/P4 backlog beads.

## Phase 6 — Refinement

To be done after bead creation: re-read AGENTS.md, polish beads 4-5x, validate with `br dep cycles` (must be empty) and `bv --robot-insights`.
