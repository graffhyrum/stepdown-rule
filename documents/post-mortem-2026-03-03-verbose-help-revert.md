# Post-Mortem: Verbose Help Output → Revert → Description Bolstering

**Date**: 2026-03-03
**Duration**: ~15 minutes
**Participants**: Primary agent
**Status**: Completed

## Executive Summary

The thread began with a pre-approved plan to add full subcommand option trees to the root `--help` output via `program.addHelpText`. The user immediately recognised the output was redundant and messy, asked whether Commander.js had a built-in mechanism for this, learned there wasn't one, and pivoted to reverting the custom block and instead enriching the existing description strings. The final state is cleaner and idiomatic.

## What Went Well ✅

1. **Fast pivot** — The revert + description bolster was two targeted edits with no collateral damage.
2. **Library research before re-implementing** — Used Context7 to confirm no built-in recursive help existed before suggesting alternatives, avoiding another round-trip.
3. **Description quality** — New strings are meaningfully richer: examples in `--ignore`, override semantics in `--config`, use-case callout in `--json`, inline rule semantics in `--rules`.

## What Could Improve ⚠️

1. **Plan was approved but was the wrong approach**
   - **Impact**: One round of implementation was immediately discarded.
   - **Root cause**: The plan was technically correct but the UX outcome ("messy/redundant") was predictable without running it — the plan itself should have raised this risk.
   - **Mitigation**: When a plan appends duplicated content to a help screen, note "this will repeat all option text twice" in the plan and surface it as a trade-off requiring explicit sign-off.

2. **`addHelpText` was not the right tool; description strings were the right tool**
   - **Impact**: The approved plan solved discoverability by duplication rather than by enrichment.
   - **Mitigation**: In CLI help plans, prefer enriching existing surfaces (descriptions, argument help) over appending custom blocks. Custom `addHelpText` is better suited for docs links, examples, or env-var references — not for mirroring option lists.

## Key Decisions Made 📌

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Implement `addHelpText` as planned | Plan was pre-approved | Output was messy; immediately pivoted |
| Research Commander.js built-ins before re-implementing | User asked directly; avoid guessing | Confirmed no built-in recursive help; clean answer delivered |
| Bolster description strings instead | Idiomatic, non-duplicating, discoverable via `help <cmd>` | Cleaner output; same information density |

## Time Analysis

| Phase | Notes |
|-------|-------|
| Implementation | Single `Edit` call; fast |
| Pivot decision | One Context7 research call; ~2 exchanges |
| Revert + bolster | Four `Edit` calls; fast |

## Lessons Learned 🎓

### Applicable Everywhere
- **Duplication in output is a smell even in approved plans.** If a plan's mechanism copies content that already exists elsewhere, flag it explicitly in the plan body — don't wait for the user to notice after implementation.

### Specific to This Work (CLI Help Design)
- Commander.js's idiomatic discoverability path is `help <subcommand>` / `subcommand --help`. Appending duplicated help blocks to the root help is anti-idiomatic.
- The right levers for richer root-level help are: (a) subcommand description strings, (b) `configureHelp({ subcommandTerm })` for custom formatting in the Commands table, (c) `addHelpText` for non-duplicating additions like example blocks or doc links.
- `showGlobalOptions` propagates parent options *down* into subcommand help — useful for shared flags, not for tree expansion upward.

### For Future Agents/Threads
- **Suggest**: When a plan involves CLI help output, include a mock of the rendered output in the plan. This surfaces "messy/redundant" before implementation.
- **Avoid**: `addHelpText("after", ...)` for mirroring option lists — use it for examples, links, or env-var documentation.

## Patterns for Reuse

**Enriched description strings as the primary discoverability mechanism:**
- Add concrete examples to argument/option descriptions (e.g. `'dist/**' '**/*.test.ts'`)
- State override semantics where config layering exists (`CLI flags override file values`)
- Name use cases, not just mechanics (`useful for editor integrations`)
- Inline available values with brief semantics when the option controls branching behaviour (`'stepdown' (caller-before-callee), 'nested' (logic-before-nested-functions)`)

## Recommendations

### "If we could redo this thread..."
- The plan should have included a rendered mock of the `--help` output showing the duplicated content and flagged: "Note: this repeats all option text twice — confirm this is the desired UX."
- That single addition would have triggered a pivot at plan-review time rather than post-implementation.

### Rule Change Proposals
- **CLAUDE.md addition**: When a plan appends content to a CLI help screen, include a rendered mock of the output in the plan body and explicitly note any content duplication.

### "Skills we should have loaded"
- No skills were loaded. A **`commander`** or **`cli-design`** skill with Commander.js idioms (description enrichment, `configureHelp`, when to use `addHelpText`) would have short-circuited the implementation→revert cycle.

### "Skills which didn't help"
- None loaded; N/A.

### "How can we make this work more deterministic?"
- A pre-plan hook that checks: "does this plan's output duplicate existing CLI content?" is probably too narrow to be a general hook.
- More actionable: add a `cli-help-design` section to the project CLAUDE.md noting Commander.js idioms and the `help <subcommand>` pattern as the standard discoverability path.

### Proposed workflow for future CLI help changes
1. Read current `--help` and `subcommand --help` outputs first
2. Draft enriched description strings targeting the subcommand help screen
3. If root-level additions are needed, use `addHelpText` only for non-duplicating content (examples, env vars, doc links)
4. Render a mock of the final `--help` output in the plan
5. Get sign-off before implementing

## Metrics

- **Goal completion**: 100% — richer, cleaner help output delivered
- **Time efficiency**: ~0.6 — one full implementation cycle was discarded
- **Quality score**: 7/10 — outcome is good; one avoidable round-trip
- **Reusability**: medium — CLI help design lessons are broadly applicable
- **Documentation quality**: good

## Follow-up Actions

- [ ] Add CLI help design idioms to project CLAUDE.md (Commander.js `help <subcommand>` pattern, when to use `addHelpText`)
- [ ] Consider a `cli-design` or `commander` skill that codifies these patterns

## Related Threads

- Session: 020fbd55-737b-4bfe-bed7-08555c65061b (plan was authored here)
