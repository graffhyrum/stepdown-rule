# Honesty Inventory — @stepdown/analyzer

**Skill applied:** `just-say-no-to-process-porn-and-ceremony` (full honesty audit)
**Scope / window reviewed:** branch `camp/just-say-no` (3 commits ahead of `main`), plus the standing repository state at HEAD `bb7711c`. Branch delta is docs-only (README + two skill-selection docs); no source, test, gate, or CI changes in the window.
**Date:** 2026-10-31
**Auditor posture:** adopted — no defense of prior author choices; findings stated plainly.

## Boundary test used throughout

> Does running code branch on this artifact?
> - **Yes** → product runtime state (feature work; creation gate does not apply).
> - **No** (only humans/status reports read it) → process; creation gate applies, and it must name a consumer, a gate, a defect class, and a deletion condition.

"Running code" means the shipped CLI/library at runtime, or a gate that blocks merge/release at CI time. Artifacts that only feed humans, agents, or reports are ceremony unless an explicit operator request (this task) makes them a stated consumer.

---

## Part 1 — Tests and Gates

1. **Weakened/deleted/skipped tests?**
   Answer: No (checked: `git diff --name-only main..HEAD` shows only README.md and two docs/* files; no test files touched in the window. Full `git log --oneline main..HEAD` = 3 doc commits. `bun test` re-run at HEAD: 229 pass / 0 fail / 611 expect() across 22 files. No `#[ignore]`/skip additions in window. Reflog shows a single `reset: moving to HEAD` with no history rewrite.)

2. **Specialized mock/fixture just to satisfy a simplistic unit test?**
   Answer: No (checked: fixtures/* are consumed by integration-style tests reading real files via `Bun.file`; `InMemoryFileService` is an explicit test double with a documented role, not a stand-in for real behavior. No new doubles introduced in window.)

3. **Regenerated golden/snapshot to match broken output?**
   Answer: No (checked: `tests/goldens/` unchanged in window; `schema-format.test.ts` compares committed `stepdown-schema.json` against `HEAD:stepdown-schema.json`, unchanged. No golden edits in the 3 commits.)

4. **Edited validator/gate/CI/conformance code in same change as the feature it checks, or added suppression pragmas / bypass flags / widened tolerances?**
   Answer: No (checked: no CI workflow, oxlint/oxfmt config, tsconfig, or hook changes in the window. `.cursor/hooks/vet-stop.ts` and `scripts/rule-validator.ts` unchanged. No `eslint-disable`/`@ts-ignore`/`# noqa`/`--no-verify`/`[skip ci]`/`continue-on-error` introduced.)

5. **Anything that doesn't make sense objectively but satisfies a release gate (demo-path hardcoding, env sniffing, narrowed scope, cherry-picked denominator)?**
   Answer: No (checked: branch delta is documentation only; no code paths changed. `bun test` and `bun run typecheck` and `bun run lint` all green at HEAD without narrowing.)

6. **Any zero-run green (filtered-out / feature-gated / wrong positional filter)?**
   Answer: No (checked: 229 tests actually executed across 22 files with 611 `expect()` calls in 514ms; no `.only`/`.skip` patterns in test files (`rg` for `\.only\(|\.skip\(` in tests/ returned no matches).)

## Part 2 — Claims and Reporting

7. **Claimed a command/test/benchmark/inspection not actually run?**
   Answer: No (checked: every command cited in this inventory was executed in this session — `bun test`, `bun run typecheck`, `bun run lint`, `git diff`, `git reflog`, `cass search`. Outputs quoted from actual runs.)

8. **Presented fixture/capture/mock/replayed output as live proof, or a lower proof class as a higher one?**
   Answer: No (checked: test results are from a live `bun test` run against the real checkout; no replayed/cached output presented as fresh.)

9. **Omitted/softened/buried a failure that would change the reader's conclusion? Any "done and verified" where honest phrasing was "done, unverified"?**
   Answer: No (checked: all three quality gates green; no failures to bury. Where verification is self-run only, it is labeled as such in Part 5.)

10. **Silenced stderr (or discarded output) in a command whose result was cited as evidence?**
    Answer: No (checked: commands run without `2>/dev/null` or stderr redirection; outputs captured in full.)

11. **Closed/reported complete a work item whose acceptance conditions were not met, including follow-up laundering?**
    Answer: No (checked: no beads closed in this window; `bd` not invoked for closure. Branch contains no code changes to a bead's acceptance criteria.)

12. **Edited spec/plan/requirements to match what was built while reporting success against the original ask?**
    Answer: No (checked: branch touches README + skill-selection docs only; no spec/plan/PRD edits to retroactively match implementation.)

## Part 3 — Swarm and Subagents

13. **Did any swarm agent close its own or a peer's tracker item without evidence bound to a revision?**
    Answer: No (checked: no subagents dispatched in this task; single-agent session. No tracker closures performed.)

14. **Dispatched a subagent with gameable success criteria ("make the tests pass") rather than acceptance criteria with positive observable, planted negative, No-Claim line?**
    Answer: No (checked: no subagent dispatch in this task.)

15. **Accepted a subagent's report without re-executing cited commands or reading its diff?**
    Answer: No (checked: no subagent reports accepted in this task.)

16. **Any panes/subagents farming refusals while positive capabilities stay open?**
    Answer: No (checked: no delegation in this task.)

17. **Counted agreement between agents as confirmation where they shared a source/grep/premise?**
    Answer: No (checked: no multi-agent agreement cited anywhere in this inventory.)

18. **Reported a metric whose denominator was chosen after seeing results?**
    Answer: No (checked: metrics quoted (229 tests, 22 files, 611 expects) are raw `bun test` output, not derived/selected.)

## Part 4 — Older Sessions

cass is installed but its index is stale (14 days). Sweeps run (bounded):

- `cass search "weaken the test"` → 11 hits, all in unrelated projects (founders-fabrication, crap4ts, ff-elysia, jobAppTracker) or generic agent subagent transcripts; none in stepdown-rule sessions. No evidence of test-weakening in this project's history.
- `cass search "stepdown-rule"` → hits only in opencode/cursor sessions referencing this repo; spot-check not deep-read.
- Additional derived query `cass search "make the test pass"` not run (index stale; diminishing returns). Recorded as not-run rather than claimed.

No past-session behavior recognized as hiding the ball. If the index is refreshed (`cass index`), a deeper sweep is warranted before a release; recorded as open debt, not a finding.

## Part 5 — The Mirror

19. **If the project owner replayed this session, is there any moment you would want to explain first?**
    Answer: Yes, one: this inventory itself is a process artifact that gates no running code. It exists only because the task explicitly requested an honesty inventory. Per the boundary test it is ceremony, and per the creation gate it is justified solely by the explicit operator request (consumer = operator reading this report; gate = the done-declaration for this task; defect class = process-porn/ceremony risk in agent work; deletion condition = retire/replace when the branch merges or the next audit supersedes it). That justification is recorded here rather than hidden. No code behavior was changed to make the inventory look good.

20. **Single strongest piece of evidence that the main claimed result is real, re-executable by a skeptic?**
    Answer: `bun test` at HEAD `bb7711c` prints `229 pass / 0 fail / 611 expect() calls / Ran 229 tests across 22 files` (re-run in this session, ~514ms), plus `bun run typecheck` → `✓ No type errors in 74 files` and `bun run lint` → all matched files use correct format. All three are re-executable by a skeptic with `bun install && bun test && bun run typecheck && bun run lint`.

---

## Artifact Boundary Inventory (which artifacts gate running code vs. ceremony)

### A. Product runtime (running code branches on them)

| Artifact | Consumer | Gate it enforces |
|---|---|---|
| `src/*.ts` (analyzer, fixer, pipeline, rules, services, config) | shipped CLI + library users | behavior of `stepdown-rule` |
| `package.json` (bin, scripts, deps) | bun/npm at install/run | package resolution & entrypoint |
| `fixtures/*.ts` | tests reading them as inputs | test expectations (indirectly) |
| `scripts/install.sh`, `scripts/install.ps1` | end users installing releases | installer correctness (release gate) |

### B. CI / merge / release gates (not runtime, but block shipping)

| Artifact | Consumer | Gate |
|---|---|---|
| `.github/workflows/release.yml` | GitHub Actions | typecheck + lint + test + compile before release |
| `.github/workflows/version-packages.yml` | GitHub Actions | changeset versioning on main |
| `.github/workflows/pages.yml` | GitHub Actions | install-script publishing on tag |
| `tests/*.test.ts` + `tests/goldens/*` | `bun test` (CI + vet-stop) | merge/release |
| `tsconfig*.json` | `bun check` / `tsc` | type safety (CI) |
| `.oxlintrc.json`, `.oxfmtrc.json` | oxlint / oxfmt | lint/format (CI + vet-stop) |
| `scripts/rule-validator.ts` | `custom-hooks` / `vet` | AGENTS.md rule compliance |
| `scripts/build.ts` (+ compile scripts) | release pipeline | artifact generation |
| `.cursor/hooks/vet-stop.ts` + `hook-schema.ts` | Cursor/Grok stop hook | `bun vet` on agent stop |

### C. Generated contract (test-gated for consistency; not branched on by runtime)

| Artifact | Consumer | Gate | Deletion condition |
|---|---|---|---|
| `stepdown-schema.json` | README `$schema` ref + `schema-format.test.ts` | committed file == build output | delete if schema is only ever read from in-code `FileConfigJsonSchema` (runtime source of truth) |

### D. Ceremony / process (humans and agents read; no running code branches on them)

| Artifact | Consumer | Gate | Deletion/retirement condition |
|---|---|---|---|
| `docs/*`, `README.md`, `SKILL.md`, `CHANGELOG.md` | humans | none (informational) | retire when stale; keep entry-point docs |
| `AGENTS.md` | agents | none (advisory) | retire rules that stop binding |
| `.changeset/*` | changesets CLI | versioning cadence | delete once versioned |
| `.beads/*` | br/bv tooling + humans | none (tracking) | archive closed issues per br policy |
| `.specstory/*`, `.grok/*`, `.cursor/rules/*`, `.vscode/*` | tooling | none | delete when tooling unused |
| `docs/HONESTY_INVENTORY.md` (this file) | operator reading this report | done-declaration for this task | retire/replace on next audit or branch merge |
| `docs/RECOMMENDED_SKILLS_FOR_THIS_PROJECT.md`, `docs/COMPREHENSIVE_ANALYSIS...` | humans | none | retire when superseded |

### E. Boundary findings

- No artifact in category D is claimed to gate running code. The only "gates" in D are human/agent discipline, not runtime branches.
- `stepdown-schema.json` (category C) is the one borderline case: runtime uses the in-code schema (`FileConfigJsonSchema` in `src/cli-agents.ts`); the committed file is a mirror enforced by `schema-format.test.ts`. If the test were removed, runtime behavior would not change. Recorded as deletion candidate, not deleted here (deletion is a code change requiring its own bead/review; this inventory only documents).
- No ceremony artifact was manufactured with a synthetic consumer to dodge the creation gate (no SM-10). The creation gate for this file is satisfied by the explicit task request, recorded in Part 5.

---

## Disposition

- [x] Corrected in place: no corrections needed; branch delta is docs-only and all three quality gates green.
- [x] Disclosed to the operator/owner: this file is the disclosure; uncomfortable truths recorded in Part 5 (this inventory is ceremony justified only by explicit request).
- [ ] Encoded as a countermeasure: open debt — refresh `cass` index and re-run Part 4 sweeps before any release; consider a bead to delete the redundant `stepdown-schema.json` mirror (pattern RH-1-class artifact: a generated file with no runtime consumer). No pattern-ID countermeasure beyond naming the RH/SM/PL IDs in the catalog; this repo has no tracker entry for them yet.

**Verdict:** Looked. Found no test-weakening, gate self-weakening, claim fabrication, or history rewrite in the window. The one honest finding is that this inventory is itself process artifact (ceremony) whose only justification is the explicit request that produced it. Clean otherwise, contingent on the open debt items above.
