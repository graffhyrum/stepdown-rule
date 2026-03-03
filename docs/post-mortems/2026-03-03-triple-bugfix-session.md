# Post-Mortem: Triple Bugfix Session

**Date**: 2026-03-03
**Duration**: ~15 minutes
**Participants**: Primary agent (Opus 4.6) + 3 Sonnet subagents (bugfix) + 3 Haiku subagents (review)
**Status**: Completed

## Executive Summary

Fixed three bugs (2x P0, 1x P1) in parallel via worktree-isolated subagents, then ran /simplify review which caught a fourth bug (duplicate cycle detection in graph-algorithms.ts) and two efficiency improvements. All 92 tests pass, coverage stable at 97.8%.

## What Went Well

1. **Parallel dispatch** - All three bugfixes dispatched simultaneously; the first completed in 14s, the third in 57s. No serial bottleneck.
2. **Worktree isolation** - Each subagent worked in its own git worktree, preventing merge conflicts between agents touching the same file (analyzer.ts).
3. **Scope discipline in main agent** - When worktree diffs contained out-of-scope changes (all three agents made unauthorized refactors), the main agent applied only the targeted fixes manually rather than blindly merging.
4. **/simplify caught a real bug** - The review phase found a duplicate early-return bug in graph-algorithms.ts that would have been missed without systematic review.
5. **Baseline established first** - Running `bun run vet` before any changes gave a clean before/after comparison.

## What Could Improve

1. **Subagent scope violations** - All 3 subagents made changes beyond their bead scope (refactored callGraphToDependencyMap, added imports). The main agent had to discard these and apply fixes manually.
   - **Impact**: Added ~3 minutes of manual work reviewing and cherry-picking diffs
   - **Mitigation**: Add explicit "DO NOT modify any other functions or imports" to subagent prompts. Consider adding a file-level scope constraint.

2. **Biome config schema mismatch** - `bun run vet` fails due to biome.json schema version vs installed version. This is a pre-existing issue that obscures whether our changes introduced lint problems.
   - **Impact**: Had to run build/typecheck/test separately instead of the unified `vet` command
   - **Mitigation**: Fix biome.json schema version (separate bead)

3. **Biome auto-formatting reverted edits** - When editing analyzer.ts, biome's format-on-save reverted the graph-algorithms.ts fix. Had to re-read and re-apply.
   - **Impact**: One wasted edit cycle (~30s)
   - **Mitigation**: Apply all edits to a file at once, or batch edits before triggering format

4. **Review agents could have been more targeted** - The quality review agent flagged `safeIdentifiers` naming as "leaky abstraction" which is subjective. The reuse review was thorough but found nothing actionable.
   - **Impact**: Minor — agents were fast (Haiku, 16-42s each)
   - **Mitigation**: Acceptable cost for the cycle detection bug it caught

## Key Decisions Made

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Manual cherry-pick over worktree merge | Worktrees had out-of-scope changes | Clean, targeted fixes applied |
| Cache file-level identifiers in context | Efficiency review found N redundant file scans | Reduced per-file work by ~Nx |
| Use `node.text` over `node.getText()` | Identifiers have direct `.text` property | Eliminated unnecessary substring lookups |
| Fix graph-algorithms.ts cycle bug | Quality review found duplicate of analyzer.ts bug | Consistent behavior across both pipelines |

## Time Analysis

| Phase | Estimated | Actual | Notes |
|-------|-----------|--------|-------|
| Pre-flight (triage, baseline) | 2m | 2m | Clean |
| Bug dispatch + completion | 3m | 4m | Parallel, fastest 14s, slowest 57s |
| Cherry-pick + verify | 3m | 5m | Manual due to scope violations |
| /simplify review dispatch | 1m | 1m | Three Haiku agents in parallel |
| /simplify fixes | 3m | 4m | Biome revert cost one retry |
| Commit + push | 1m | 2m | Pre-existing uncommitted changes blocked push |
| **Total** | **13m** | **18m** | Scope violations + biome issues added ~5m |

## Lessons Learned

### Applicable Everywhere
- **Subagents will expand scope** — Always include explicit negative constraints ("DO NOT modify functions outside X", "DO NOT add/remove imports")
- **Cherry-pick over merge** — When subagents work in worktrees, review diffs before merging; manual application of targeted changes is safer than git merge
- **Review catches real bugs** — The /simplify review found a duplicate bug that subagents noted but were told not to fix; the review surfaced it for the main agent

### Specific to This Work
- **Two cycle detection implementations** — analyzer.ts and graph-algorithms.ts have parallel implementations. This is a consolidation candidate (bead stepdown-ci4 exists for this)
- **`canConvertToFunctionDeclaration` is a hot path** — Called per variable function during extraction; file-level data should be cached at the extraction level

### For Future Agents/Threads
- **Recommend**: When dispatching bugfix subagents, include a "SCOPE BOUNDARY" section listing exactly which functions/lines may be modified
- **Suggest**: Load `biome` skill before /simplify to catch format issues proactively
- **Avoid**: Trusting worktree diffs without reviewing — always `git diff` and check stat before merging

## Patterns for Reuse

### Parallel Bugfix Dispatch Pattern
1. Verify bugs are in independent scopes (different functions/files)
2. Claim all beads simultaneously
3. Dispatch subagents with worktree isolation
4. Review each worktree diff for scope compliance
5. Apply only in-scope changes manually to main branch
6. Run tests after each application
7. Run /simplify review on aggregate changes

### Efficiency Review Caching Pattern
When a function is called per-item but computes file-level data:
1. Identify the file-level data (function names, imports)
2. Compute once at the file-processing entry point
3. Thread through via context object
4. Per-item function only adds item-specific data (parameters)

## Recommendations

### "If we could redo this thread..."
- Add `"DO NOT modify any function besides <target>. DO NOT add or remove imports."` to each subagent prompt
- Fix biome.json schema version before starting, so `vet` works as a single quality gate
- Commit pre-existing changes first to avoid push-hook issues at the end

### Rule Change Proposals
- Add to CLAUDE.md: "When dispatching bugfix subagents, include explicit scope boundaries listing which functions may be modified and which files may be touched"
- Add to CLAUDE.md: "Always commit pre-existing uncommitted changes before starting new work to avoid push-hook conflicts"

### "Skills we should have loaded"
- `biome` — Would have caught the schema mismatch before it blocked `vet`
- `testing-patterns` was suggested by `ms suggest` but not needed for bugfix work

### "Skills which didn't help"
- `ms suggest` returned `dev-browser`, `seam`, `grep-search` — none relevant to AST analyzer bugfixes
- Skill suggestions could benefit from project-type awareness (this is a CLI tool, not a web app)

### "How can we make this work more deterministic?"
- **Hook**: Pre-push hook already exists and caught uncommitted changes — working as intended
- **Script**: A `scripts/dispatch-bugfix.sh` template that generates subagent prompts with scope boundaries from bead descriptions
- **Template**: Subagent prompt template with mandatory SCOPE BOUNDARY section

### Proposed Workflows
**Parallel Bugfix Workflow:**
1. `bd ready` → select up to 3 independent beads
2. `bun run vet` → establish baseline (fix pre-existing issues first)
3. Commit any pre-existing changes
4. Claim all beads (`bd update --status=in_progress`)
5. Dispatch subagents with worktree isolation + scope boundaries
6. Cherry-pick diffs (never blind merge)
7. Test after each application
8. `/simplify` review on aggregate
9. Apply review fixes
10. `bd close` → `bd sync` → commit → push

## Metrics

- **Goal completion**: 100% (3 beads closed + 1 bonus bug fixed + 2 efficiency improvements)
- **Time efficiency**: 0.72 (13m estimated vs 18m actual)
- **Quality score**: 8/10 (scope violations required manual intervention, but caught by review)
- **Reusability**: High — parallel bugfix pattern is directly reusable
- **Documentation quality**: Good — post-mortem captures actionable improvements

## Follow-up Actions

- [ ] Fix biome.json schema version mismatch (create bead)
- [ ] Add subagent scope boundary template to CLAUDE.md or beads-start skill
- [ ] Consider consolidating duplicate cycle detection (bead stepdown-ci4 exists)

## Related Threads

- Beads: stepdown-ee5, stepdown-yz9, stepdown-40o (all closed this session)
- Related open bead: stepdown-ci4 (consolidate duplicate buildCallGraph and CallSiteInfo)
