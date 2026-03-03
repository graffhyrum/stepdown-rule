# Post-Mortem: Fix circular dependency exit code

**Date**: 2026-03-02
**Duration**: ~5 minutes
**Participants**: Primary agent
**Status**: Completed

## Executive Summary

Fixed `bun vet` failing because `cli.ts` treated circular dependencies as exit-code-1 failures. The analyzer found 0 violations but 5 circular deps (legitimate mutual recursion in AST visitors), causing the custom-hooks step of `vet` to fail. Changed circular deps to informational-only: no exit code impact, no output unless verbose or violations present. Hit a biome cognitive complexity lint error on first pass, extracted helper functions to resolve.

## What Went Well

1. **Pre-planned approach** - Plan was already approved with exact line numbers and logic, so execution was direct with no exploration needed.
2. **Incremental verification** - Built and tested after each logical step: build, analyze (exit 0), analyze -v (circular deps shown), tests, vet.
3. **Fast recovery from lint failure** - Biome complexity violation was caught on first `vet` run and fixed immediately by extracting two small helpers.

## What Could Improve

1. **Missed the biome complexity impact during planning**
   - **Impact**: Extra edit cycle + second vet run (~30s wasted)
   - **Mitigation**: Plan phase should run biome complexity check on affected functions, or note "may need extraction if complexity increases"

2. **`formatAnalysisResult` fix not in original plan**
   - **Impact**: The plan said "no change needed" for `formatAnalysisResult` but the condition on lines 170-177 would still show circular deps without verbose when there were no violations. Caught during implementation.
   - **Mitigation**: Plan should have traced all code paths that gate circular dep output, not just the two explicitly called out.

## Key Decisions Made

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Remove `circularCount > 0` from exit check | Circular deps are informational, not violations | `bun vet` passes |
| Silence output when 0 violations + non-verbose | "Silence is success" principle | Clean CI output |
| Fix `formatAnalysisResult` early-return condition | Would have leaked circular dep output without verbose | Consistent behavior |
| Extract `formatViolationSummary` / `formatCircularSummary` | Biome cognitive complexity 11 > max 10 | Lint passes |

## Time Analysis

| Phase | Estimated | Actual | Notes |
|-------|-----------|--------|-------|
| Read source | 10s | 10s | Single file read |
| Edits | 30s | 45s | 3 edits + 1 unplanned |
| Build + verify | 60s | 90s | Two vet runs due to lint |
| Total | ~2min | ~3min | Good efficiency |

## Lessons Learned

### Applicable Everywhere
- When modifying branching logic, always check biome cognitive complexity impact before committing to an approach. Extracting helpers proactively is cheaper than reacting to lint.
- "No change needed" assertions in plans should be verified against all code paths, not just the obvious ones.

### Specific to This Work
- The `formatAnalysisResult` function had a non-obvious gate: it returned `null` only when all three counts were zero AND not verbose. Changing the *summary* function without also fixing the *per-file format* function would have been inconsistent.

### For Future Agents/Threads
- **Recommend**: When a plan says "no change needed" for a function, verify by reading the function and tracing the changed variable through its conditions.
- **Avoid**: Trusting line-number references from plan mode — they may shift after edits.

## Patterns for Reuse

**"Silence is success" CLI pattern**: When a CLI tool finds nothing wrong, print nothing (exit 0). Only print on violations or when verbose is requested. This matches unix convention and keeps CI logs clean.

**Complexity budget pattern**: When adding conditional branches to a function near biome's complexity limit, preemptively extract string-formatting helpers. They're trivially correct and reduce cognitive complexity cheaply.

## Recommendations

### "If we could redo this thread..."
- The plan should have included a complexity check: "Run `biome check src/cli.ts` to verify complexity budget before/after". This would have caught the issue during planning.
- The thread workflow was efficient — read, edit, verify. No wasted exploration.

### Rule Change Proposals
- Consider adding to CLAUDE.md: "When modifying branching logic in functions, check biome cognitive complexity with `bunx biome check <file>` before and after changes."

### "Skills we should have loaded"
- `biome-complexity-reduction` skill exists and would have been relevant. The plan prompt didn't mention "biome" or "complexity" so it wasn't triggered. Adding "check biome complexity" to the plan text would have helped.

### "Skills which didn't help"
- No unnecessary skills were loaded. The session was lean.

### "How can we make this work more deterministic?"
- A pre-commit hook already exists (via `bun run vet`). The fix itself makes the hook pass.
- The plan-to-implementation pipeline worked well here. No additional automation needed for this type of change.

### Proposed workflows
For "fix CLI exit code behavior" tasks:
1. Read the CLI entry point
2. Identify all code paths that set `process.exitCode` or print output
3. Edit exit code logic
4. Edit output/summary logic (check ALL functions that gate the changed signal)
5. Run `biome check <file>` to verify complexity
6. Build + run CLI manually to verify behavior
7. Run full test suite
8. Run `vet`

## Metrics

- **Goal completion**: 100%
- **Time efficiency**: 1.5x (3min actual vs ~2min ideal if no lint issue)
- **Quality score**: 9/10 (caught the `formatAnalysisResult` issue the plan missed)
- **Reusability**: Medium (pattern applies to any CLI exit-code fix)
- **Documentation quality**: Adequate

## Follow-up Actions

- [ ] Consider loading `biome-complexity-reduction` skill when plans touch branching logic
- [ ] No new hooks needed — existing `vet` pipeline is sufficient

## Related Threads

- Plan mode transcript: `5c542e14-d46c-467b-a78a-c528f993216a`
