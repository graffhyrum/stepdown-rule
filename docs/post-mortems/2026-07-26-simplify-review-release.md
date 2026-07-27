# Post-Mortem: simplify-review pending release/path changes

**Date**: 2026-07-26
**Status**: Completed

## Executive Summary

Ran `/simplify-review` on all pending (uncommitted) release and cross-platform path work: native Bun compile helpers, GitHub Release/Pages install, and `FileService` Windows path normalization. Three simplify agents plus three expert councils surfaced reuse, efficiency, and safety issues; remediations landed in-tree (glob ignore + post-filter, typed compile targets, SHA256SUMS assert, ENOENT-only `lstat` catch, stepdown reorder). Supply-chain and tsconfig gaps deferred to beads.

## Bead Outcomes

<!-- From: tracker (Phase 0c; br diff unavailable) -->
- Closed: none (this session)
- Opened: `stepdown-ls0` (install curl|bash harden), `stepdown-82a` (typecheck scripts/tests), `stepdown-s23` (dual install channels)
- Modified: beads sync noise from concurrent tracker work; related prior beads remain open (`stepdown-v3a`, `stepdown-74p`, etc.)

## What Went Well

1. **Parallel simplify + expert passes** - Reuse/quality/efficiency agents then Matt/Martin/Inquisitor councils produced overlapping RED/YELLOW with high consensus; remediations were unambiguous.
2. **Test-driven FileService fix** - Absolute-path ignore failure on Windows was caught immediately by `tests/file-service.test.ts`; hybrid glob ignore + post-filter was the correct fix.
3. **Single compile helper module** - `compile-native.ts` as source of truth for targets/asset names reduced drift vs CI/install scripts.
4. **Fail-loud compile pipeline** - Replacing `process.exit` with throws and asserting SHA256SUMS asset set matches `RELEASE_COMPILE_TARGETS` moved failure earlier.

## What Could Improve

1. **Optimistic glob-only ignore restore**
   - **Impact**: First restore of `glob({ ignore })` alone broke absolute Windows paths; one test failure + rework.
   - **Mitigation**: On Windows-sensitive path APIs, keep belt-and-suspenders (library ignore + post-filter) until proven otherwise; write characterization test before changing ignore strategy.

2. **cm playbook empty / low-signal hydration**
   - **Impact**: Phase 0 `cm context` returned no bullets; cass scores were near-noise.
   - **Mitigation**: Seed cm with post-mortem lessons after review sessions (done this close).

3. **Skill suggest missed simplify-review**
   - **Impact**: `ms suggest` returned `arrange` / later `act`, not simplify/review skills — skill was only loaded because user attached it.
   - **Mitigation**: Improve simplify-review / post-mortem skill trigger keywords for "pending changes", "diff review", "release scripts".

4. **Install trust model left open**
   - **Impact**: Inquisitor RED on `curl|bash` / `irm|iex` correctly deferred but remains user-facing risk.
   - **Mitigation**: Tracked as `stepdown-ls0`; do not ship README one-liners without trust docs (`stepdown-s23`).

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Glob ignore + post-filter both | Glob ignore fails for absolute Windows paths; post-filter alone walks `node_modules` | Tests pass; relative trees still pruned early |
| `ReleaseCompileTarget` on helpers | Stop silent wrong artifact names from free `string` | Boundary validate in `build.ts` |
| Generate SHA256SUMS in `compile-release.ts` | Avoid hardcoded asset list drift in workflow | CI just cats + uploads `dist/release/*` |
| Pin Bun `1.3.14` in release.yml | Reproducible release binaries | Matches local smoke version |
| Defer curl\|bash harden | Industry pattern; needs product decision | Bead `stepdown-ls0` |
| Project post-mortem naming `YYYY-MM-DD-slug` | CLAUDE.md consolidation rule (no `post-mortem-` prefix) | File matches existing docs |

## Lessons Learned

### Applicable Everywhere
- Library ignore/filter APIs that work for relative paths may fail for absolute Windows paths — verify both shapes in tests before trusting one mechanism.
- Catch only expected errno codes (e.g. `ENOENT`) when "not a path" is a legitimate branch; rethrow EACCES/ELOOP/etc.
- Release asset names, checksums, and CI upload lists must share one generated source of truth with an explicit count/set assert.
- Prefer `throw` over `process.exit` in shared script helpers so callers can compose and tests can assert.

### Specific to This Work
- Bun `--compile` may emit `.exe` even when outfile omits the suffix — centralize candidate resolution (`resolveCompiledPath`).
- Size-bench intentionally bypasses `Bun.build` compile helper (CLI flag matrix); path resolution can still be shared without forcing the full helper.
- Stepdown applies to new script modules: put callers above callees when extracting helpers mid-session.

## Remediation

### Remediation Hierarchy (mandatory)

| Tier | Mechanism | Properties | Example |
|------|-----------|------------|---------|
| 1 | **Hook** | Deterministic, zero context cost | (none proposed — review was one-shot) |
| 2 | **Script** | Deterministic | `compile-release.ts` SHA256SUMS + asset-set assert (done) |
| 3 | **Skill/command update** | On demand | Improve simplify-review triggers for "pending diff" / release scripts |
| 4 | **Always-loaded instruction** | Last resort | Not proposed — cm-rules cover cross-cutting lessons |

### Verification

- **Test**: `bun test tests/file-service.test.ts`; `bun run dist/cli.js analyze scripts/compile-native.ts scripts/build.ts src/services/FileService.ts` → 0 violations; `bun run typecheck`
- **Bypass mode**: Skill bypass still allows shipping without expert pass; no hook enforces simplify-review. Install trust remains soft until `stepdown-ls0`.

### Skill Coverage

<!-- From: ms suggest --machine --cwd . (Phase 0e) -->
Skills relevant to this session: simplify-review (user-attached), post-mortem (user-attached), act (suggested late for workflows)
Skills actually loaded: simplify-review, expert-review (via simplify-review), post-mortem
Gap: ms did not surface simplify-review / typescript-quality / security for pending compile+install diff

### Skill Gaps
- `simplify-review` needs stronger triggers: pending changes, uncommitted diff, release.yml, install scripts
- `act` suggestion after workflow edits is reasonable but arrived too late for this session

### Infrastructure Actions (non-rule)

- Done: `scripts/compile-native.ts`, `compile-release.ts`, `build.ts`, `FileService.ts`, `.github/workflows/release.yml` remediations
- Open: typecheck coverage for `scripts/` + `tests/` (`stepdown-82a`)
- Open: document or pin Pages vs Release install (`stepdown-s23`)
- Open: install supply-chain harden (`stepdown-ls0`)

## Follow-up Actions

- [ ] Update simplify-review skill triggers for pending/uncommitted/release-script reviews
- [x] Asset-set assert + SHA256SUMS in `compile-release.ts`
- [x] Pin Bun version in release workflow
- [ ] Always-loaded instructions? **No** — cm-rules sufficient; tiers 1–3 cover the rest

```bash
# Already created this session:
# stepdown-ls0, stepdown-82a, stepdown-s23
br search "install supply-chain" 2>/dev/null
br search "typecheck scripts" 2>/dev/null
```

## Candidate Rules (for cm reflect)

- **Pattern**: "When normalizing paths for glob/minimatch on Windows, test absolute and relative patterns; do not rely on glob ignore alone." (source: this post-mortem)
- **Pattern**: "In path-or-glob catch blocks, only swallow ENOENT; rethrow other fs errors." (source: this post-mortem)
- **Pattern**: "Release artifact lists and checksum files must be generated from one typed target list with a set/count assert before publish." (source: this post-mortem)

## cm Feedback

[cass: helpful none — empty playbook]
[cass: harmful none]

## cm Session Close

```bash
# After cm add in this close:
cm mark <new-ids> --helpful --json
```

## Related Threads

- Prior: Cross-platform installation / compile-native session (`b4be6d84-cdc2-4c11-885f-507eaecf5228`)
- Size audit: `docs/post-mortems/2026-07-26-compile-size-audit.md`
- Expert agents: Matt Pocock `954c7123`, Robert Martin `fd223dd6`, Inquisitor `84f53477`
- Beads: `stepdown-ls0`, `stepdown-82a`, `stepdown-s23`
