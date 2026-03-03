# Post-Mortem: Fresh Eyes Bug Hunt

**Date**: 2026-03-02
**Duration**: ~15 minutes
**Participants**: Claude Opus 4.6 (primary), 3x Claude Haiku 4.5 (review agents)
**Status**: Completed

## Executive Summary

User requested a "random deep exploration" of the codebase to find bugs with fresh eyes. Session read all 15 source files, traced execution flows through the analyzer/fixer pipeline, identified 3 confirmed bugs, fixed them, then ran `/simplify` which launched 3 parallel review agents. One valid simplification was applied (redundant state); two false-positive "regression" flags from review agents were correctly dismissed because agents lacked the original bug context.

## What Went Well

1. **Systematic file reading** - Reading all source files before forming conclusions prevented premature pattern-matching. All 15 src files were read in 3 parallel batches.
2. **Hypothesis verification** - Each bug was confirmed with a runnable `bun -e` script before any code was touched. This prevented false fixes.
3. **Bug #1 (formatCircularDependency)** was a clear, active, user-facing bug caught by tracing data flow from `extractCycle` through `AnalysisResult` to CLI output.
4. **Bug #2 (isNonValueIdentifierContext)** required understanding PropertyAccessExpression AST structure (`expression` vs `name` child) - a subtle semantic distinction.
5. **Full pipeline validation** - typecheck + biome check + 92 tests run after every change round.

## What Could Improve

1. **Simplify agents lacked bug context** - The 3 review agents flagged the ElementAccessExpression removal and formatCircularDependency change as "regressions" because they only saw the diff, not the bug investigation that motivated it.
   - **Impact**: Required manual triage of 6 findings, 4 of which were false positives.
   - **Mitigation**: Include a "rationale" section in the diff context passed to review agents explaining WHY each change was made, not just WHAT changed.

2. **canBeFunctionDeclaration is dormant** - Bug #2 fixes a field that nothing reads. Time was spent verifying and fixing dead code.
   - **Impact**: Low - the fix was small and correct, but the investigation to confirm it was dormant took multiple grep/search steps.
   - **Mitigation**: Accept that dormant bug fixes are cheap insurance. The `Grep` for `canBeFunctionDeclaration` usages was the right call.

3. **Complexity refactor was reactive** - The biome complexity warning on `outputAnalysisResults` was pre-existing but only surfaced after adding the circular deps summary. The refactor was done reactively.
   - **Impact**: Added ~5 minutes of unplanned work.
   - **Mitigation**: Run `bun run check` before making changes to know the baseline lint state.

## Key Decisions Made

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Fix formatCircularDependency by removing suffix | Cycle array already contains closing node `[A,B,C,A]` | Correct - avoids `A->B->C->A->A` |
| Remove ElementAccessExpression from isNonValueIdentifierContext | Both parts of `arr[idx]` ARE value references | Correct - PropertyAccessExpression `.name` is the only non-value child |
| Refactor outputAnalysisResults into 3 functions | Biome complexity limit (10) exceeded at 19 | Passed lint, complexity distributed properly |
| Dismiss agent "regression" flags | Agents lacked context about data shape of cycle arrays | Correct - `extractCycle` returns `[A,B,C,A]` not `[A,B,C]` |
| Combine totalViolations + totalNestedViolations | Only combined count was ever used downstream | Simplified return type and consumer |

## Time Analysis

| Phase | Estimated | Actual | Notes |
|-------|-----------|--------|-------|
| Exploration (read all files) | - | 3 min | 3 parallel read batches, good coverage |
| Bug identification | - | 3 min | 3 bugs found during analysis |
| Bug verification | - | 2 min | 3 `bun -e` scripts confirmed all bugs |
| Fix implementation | - | 2 min | 3 edits, straightforward |
| Validation | - | 1 min | typecheck + check + test |
| Simplify review | - | 3 min | 3 parallel agents + triage |
| Simplify fix | - | 1 min | 1 valid finding applied |

## Lessons Learned

### Applicable Everywhere
- **Verify bugs before fixing**: Running `bun -e` with minimal repros before touching production code prevented false fixes and built confidence.
- **Read data producers before consumers**: The `formatCircularDependency` bug was only visible by understanding what `extractCycle` returns. Always trace data origin.
- **Review agents need rationale, not just diffs**: Diffs without context produce false-positive regression flags.

### Specific to This Work
- **AST parent-child relationships matter**: `PropertyAccessExpression` has `.expression` (value ref) and `.name` (non-value ref). The original code treated both as non-value.
- **`canBeFunctionDeclaration` is computed but never consumed**: Future work should either use it or remove it.

### For Future Agents/Threads
- **Recommend**: When dispatching `/simplify` agents, include a brief rationale per change (e.g., "Bug fix: cycle array already includes closing node")
- **Avoid**: Assuming review agents understand the semantic context of why a change was made

## Patterns for Reuse

### "Verify-then-fix" pattern for bug hunting
1. Read all source files in parallel batches
2. Trace execution flows mentally, noting suspicious patterns
3. Write minimal `bun -e` reproduction scripts to confirm each bug
4. Fix only after confirmation
5. Run full test suite after each fix

### "Dismiss-with-evidence" pattern for false positives
When review agents flag a change as a regression, don't revert - instead verify with a test that the original behavior was wrong. The agent's "regression" is actually the intended fix.

## Recommendations

### "If we could redo this thread..."
- Run `bun run check` at session start to know baseline lint state. The complexity warning was pre-existing and could have been addressed proactively.
- Pass bug rationale to simplify agents to reduce false-positive triage time.

### Rule Change Proposals
- None needed. The exploration+fix workflow was effective within existing rules.

### "Skills we should have loaded"
- The `/simplify` skill worked well but could benefit from accepting a "rationale" parameter that gets forwarded to review agents.

### "Skills which didn't help"
- None were loaded unnecessarily.

### "How can we make this work more deterministic?"
- A "fresh-eyes audit" skill could codify the verify-then-fix pattern: read all files -> identify suspicions -> write repro scripts -> fix -> validate.
- A pre-commit hook running `bun run check` would catch lint regressions before they compound.

## Metrics

- **Goal completion**: 100% - 3 bugs found, confirmed, and fixed
- **Time efficiency**: High - no wasted exploration or dead ends
- **Quality score**: 8/10 - All bugs real and verified; one dormant bug fix is low-impact
- **Reusability**: Medium - the verify-then-fix pattern is reusable; the specific bugs are one-time
- **Documentation quality**: Good - each bug has clear before/after evidence

## Follow-up Actions

- [ ] Consider whether `canBeFunctionDeclaration` should be consumed or removed (it's computed but never read)
- [ ] Consider adding rationale forwarding to `/simplify` agent dispatch to reduce false-positive triage

## Related Threads

- `2026-03-03-triple-bugfix-session.md` - Previous bugfix session in this project
