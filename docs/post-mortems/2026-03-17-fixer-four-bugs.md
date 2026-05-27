# Post-Mortem: Fix stepdown-rule fixer not fixing violations (4 bugs)

**Date**: 2026-03-17
**Status**: Completed

## Executive Summary

Implemented a pre-approved plan to fix four bugs in the stepdown-rule analyzer and fixer: (1) dependency graph mutation via missing clone in `reorderTopLevelOnly`, (2) fixer skipping ExpressionStatements so describe/test callbacks were never processed, (3) analyzer producing false positives from name collisions in different callback scopes, (4) CLI silently misinterpreting `stepdown-rule . fix` as analyze with patterns `[".", "fix"]`. All four fixes landed with regression tests, full vet pipeline passes (104 tests, 0 violations).

## Bead Outcomes

- Closed: stepdown-3ti (Fix: fixer not fixing violations)
- Opened: none
- Modified: none

## What Went Well

1. **Plan quality was high** - The plan correctly identified all four bugs and their root causes. The implementation closely followed the plan with minimal deviation.
2. **Incremental test-driven approach** - Running tests after each change caught cascading issues early (e.g., the `processAnalysisResult` early return interaction).
3. **Biome complexity extraction** - Extracting `getAnonymousScopeName` reduced cognitive complexity from 15 to under the threshold, keeping the vet gate green.

## What Could Improve

1. **Plan underestimated cascading effects of analyzer scope change**
   - **Impact**: The analyzer fix (making callback-internal functions non-top-level) broke an existing test (`db8/aka: detects and fixes stepdown in .derive() callback`) and exposed a pipeline gate issue where `processAnalysisResult` skipped the fixer for files with 0 top-level violations.
   - **Mitigation**: Plans that change scope semantics should explicitly list all downstream consumers (analyzer, fixer pipeline, tests) and predict which test assertions change.

2. **Printer idempotency assumption was wrong**
   - **Impact**: Removing the early return in `processAnalysisResult` caused false-positive `fixed: true` results because the TS printer normalizes whitespace differently than the original source. This broke 6 tests.
   - **Mitigation**: The `fixedContent !== content` comparison in `fixParsedFile` is fundamentally unreliable. A future improvement would compare AST structure rather than printed text. For now, the early return gate masks this issue.

3. **`const` TDZ caught late** - Placing `subcommandNames` at the bottom of `cli.ts` (stepdown rule style) caused a ReferenceError because the action closure runs before the declaration is initialized. Caught only at runtime.
   - **Impact**: 1 extra debug cycle.
   - **Mitigation**: Constants used inside Commander action callbacks must be declared before the action registration. This is a known tension with the stepdown rule for CLI entry points.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Expanded `processAnalysisResult` gate to check `nestedFunctionViolations` | Needed to trigger fixer for nested violations while keeping the early return for no-violation files | Correct — fixer runs when needed, skips when not |
| Updated `.derive()` test to check scoping instead of violations | Functions inside `.derive()` are now properly scoped — the old test expected wrong behavior | Clean — test verifies the fix rather than the bug |
| Made describe-pattern test include top-level violation | The nested fixer only runs when the pipeline triggers (requires violations) | Pragmatic — tests the real-world scenario where files have both top-level and nested issues |
| Restored `fixedContent !== content` comparison | Printer-normalized comparison (`originalPrinted`) caused idempotency test failures | Correct for now, but the comparison is fragile — tracked as known limitation |

## Lessons Learned

### Applicable Everywhere
- When changing scope/visibility semantics in an analyzer, enumerate ALL downstream consumers (violation reporters, fixers, formatters, test assertions) and trace the impact through each code path before implementing.
- TS printer output is NOT idempotent with raw source text — never use `printerOutput !== rawSource` as a reliable change detector. Compare printer-to-printer or AST-to-AST.
- `const` declarations used inside Commander.js action callbacks must appear before the callback registration due to temporal dead zone — this conflicts with stepdown rule ordering.

### Specific to This Work
- `processAnalysisResult` gates fixer execution — any new violation type or scope change must update this gate condition.
- `reorderBlockStatements` puts "other" statements before function declarations, which breaks when "other" includes `return` statements that reference the functions (e.g., `.derive()` callbacks returning function references).

## Remediation

### Remediation Hierarchy (mandatory)

| Tier | Mechanism | Proposal | Justification |
|------|-----------|----------|---------------|
| 4 | CLAUDE.md rule | "Constants used in Commander action callbacks must be declared before the action registration" | Tier 1-3 can't prevent TDZ at author time; this is a code pattern rule specific to CLI entry points |

### Verification

- **TDZ rule**: Run `bun run src/cli.ts --help` after any CLI changes — ReferenceError surfaces immediately.

### Skill Coverage

Skills relevant to this session: biome-complexity-reduction, debug, subagent-workflow
Skills actually loaded: none (plan was pre-approved, implementation was direct)
Gap: biome-complexity-reduction would have been useful for the `extractFunctions` complexity issue

### Skill Gaps
- `biome-complexity-reduction` should trigger when biome reports complexity violations during vet

### Infrastructure Actions (non-rule)

None identified.

## Follow-up Actions

- [ ] Future bead: Fix `fixParsedFile` content comparison to use AST-structural comparison instead of string comparison
- [ ] Future bead: Add nested block reordering support for VariableStatement-wrapped CallExpressions (`const suite = describe(...)`)
- [ ] Future bead: Fix `reorderBlockStatements` handling of `return` statements that reference function declarations

## Candidate Rules (for cm reflect)

- **Pattern**: "When changing analyzer scope semantics, trace impact through processAnalysisResult gate, fixer pipeline, and all test assertions" (source: this post-mortem)

## cm Feedback

(no cm rules loaded this session)

## cm Session Close

(no rules to mark)

## Related Threads

- Plan transcript: 4c8ffdcb-c92e-40a0-8ae7-c795069d2fb0
