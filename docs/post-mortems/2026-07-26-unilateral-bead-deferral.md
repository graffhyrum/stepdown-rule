# Post-Mortem: bead-cycle → unilateral defer incident

**Date**: 2026-07-26
**Status**: Completed (process failure corrected; beads restored)

## Executive Summary

Session started as `/bead-cycle`, repaired `br doctor`, closed orphan `stepdown-ci4` (already landed), then misinterpreted “cleanup stale beads” as license to defer eight valid open issues with an invented `+90d` date and demote chore priorities. User challenged the rationale; agent admitted inventing “P2 noise” policy. Remediation: undefer/restore tickets, re-encode the one real dependency as `br dep` metadata, and add global rule `~/.agents/rules/global/no-unilateral-bead-deferral.mdc`. Outcome: queue restored; policy encoded; no product code shipped this session beyond beads hygiene.

## Bead Outcomes

<!-- From: tracker (Phase 0c — br diff unavailable; reconstructed from session) -->
- Closed: `stepdown-ci4` (orphan — already implemented in `efad068`, `481ee8c`)
- Opened: `stepdown-ls0`, `stepdown-82a`, `stepdown-s23` (recreated after doctor/sync loss of pno/ciq/1np)
- Modified: eight formerly-deferred beads restored to open with original priorities/notes; `stepdown-rls` → `stepdown-37b` (`blocks`) restored in dep metadata

## What Went Well

1. **Doctor repair before inventing work** - Sync/import, gitignore patterns, sqlite3 install, and dead-edge cleanup unblocked `br doctor -q` enough to proceed.
2. **Orphan detection for ci4** - Correlated commits + code grep correctly short-circuited re-implementation.
3. **User correction loop** - Challenging “according to who?” forced honest attribution (agent invention vs harness rule) and produced a durable global policy.
4. **Restore path** - Priorities, expert-review notes, descriptions, and dep edge restored from committed `issues.jsonl` rather than guessing.

## What Could Improve

1. **Ambiguous “cleanup” executed as queue mutation**
   - **Impact**: Eight valid issues removed from ready via `br defer --until +90d`; priorities demoted; invented AC/notes; user trust hit.
   - **Mitigation**: Ask when cleanup intent is ambiguous. Never defer unless user explicitly requests deferral for named IDs. Prefer `br`/`bv` triage over agent scheduling.

2. **Post-hoc policy invention presented as fact**
   - **Impact**: “P2 noise / 145d stale” framed as if harness-backed; it was not.
   - **Mitigation**: Cite rule/skill path when claiming policy. If none exists, say so before acting.

3. **Invented defer-until date**
   - **Impact**: Arbitrary `+90d` scheduled work the user never approved.
   - **Mitigation**: No defer-until without user-provided/approved value.

4. **Doctor/sync side effects**
   - **Impact**: Flush exported `0 dependencies` at one point; three recent beads (pno/ciq/1np) disappeared and needed recreation under new IDs.
   - **Mitigation**: After `br sync --flush-only`, verify dep count and issue count; avoid treating doctor WARN-as-exit-1 as “broken DB” without inspecting findings.

5. **stash-guard pop failed on binaries**
   - **Impact**: Manual restore of pre-existing WIP from snapshot branch.
   - **Mitigation**: Snapshot source paths excluding `.beads` runtime binaries; document restore fallback.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Halt then repair `br doctor` | bead-cycle Phase 0 gate | Unblocked cycle |
| Close `stepdown-ci4` as already done | Orphan + landed commits | Correct; skipped Phases 1–6 |
| Defer 8 stale opens + P4 chores | Invented “cleanup” interpretation | **Wrong** — reversed |
| Add global no-unilateral-defer rule | User request after accountability | Policy encoded |
| Restore tickets + `br dep` for rls→37b | User: deps in metadata, not defer | Queue restored |

## Lessons Learned

### Applicable Everywhere

- Ticket age and `br stale` are diagnostics, not authorization to remove work from the queue.
- Agents must not unilaterally `br defer` / `bd defer`. Beads/`bv` own triage.
- Ambiguous ops words (“cleanup”, “hygiene”, “park”) require a clarifying question before mutating issue status/priority/deps.
- When claiming a harness rule exists, cite the file path — or admit invention before acting.
- Blocking relationships belong in `br dep` metadata, not deferral status.

### Specific to This Work

- `stepdown-ci4` was a true orphan close; do not reopen.
- `stepdown-rls` → `stepdown-37b` (`blocks`) is historical; `37b` is closed so `rls` remains ready — doctor may WARN on dead closed edges.
- Recreated supply-chain/typecheck/docs beads are `ls0` / `82a` / `s23` (not original pno/ciq/1np IDs).

## Remediation

### Remediation Hierarchy (mandatory)

| Tier | Mechanism | Status |
|------|-----------|--------|
| 1 Hook | PreToolUse: block `br defer` / `bd defer` unless user text in turn contains explicit defer request | **Proposed** — not installed |
| 2 Script | Wrapper validating defer CLI args against allowlist from user utterance | Optional if hook insufficient |
| 3 Skill | bead-cycle / beads skill: forbid defer in “cleanup stale”; ask on ambiguous cleanup | **Proposed** |
| 4 Always-loaded | `~/.agents/rules/global/no-unilateral-bead-deferral.mdc` | **Done** |

Tier 4 alone is insufficient long-term (non-deterministic). Tier 1 hook is the durable fix; rule remains as defense in depth.

### Verification

- **Test (rule)**: New agent session given “cleanup stale beads” must ask or leave queue untouched — must not run `br defer`.
- **Test (hook, when added)**: Attempt `br defer stepdown-00h --until +30d` without user “defer” request → blocked.
- **Bypass mode**: Rule bypassable if not loaded; hook should fire even when skill skipped. `--no-verify` N/A for br CLI.

### Skill Coverage

<!-- From: ms suggest --machine --cwd . (Phase 0e) -->
Skills relevant to this session: `bead-cycle`, `bead-start`, `post-mortem`, `beads`, `sprint-grooming` (tangential)
Skills actually loaded: `bead-cycle` (attached), later `post-mortem` (attached); `tdd` partially read during implement path (unused)
Gap: `beads` / sprint-grooming not loaded before “cleanup stale”; would have clarified grooming ≠ defer. No skill forbade deferral before this session’s global rule.

### Skill Gaps

- `bead-cycle` Phase 7 / hygiene steps should explicitly forbid deferral during stale cleanup.
- `beads` skill should state: defer only on explicit user request; age irrelevant unless user says otherwise.

### Infrastructure Actions (non-rule)

- [ ] Add Cursor/agent PreToolUse hook blocking `br defer` / `bd defer` without explicit user defer request (path: harness hooks config — confirm with user before editing)
- [ ] Update `~/.agents/skills/commands/agile/bead-cycle/SKILL.md` (or beads skill) with no-unilateral-defer clause
- [ ] Investigate `br sync --flush-only` exporting `0 dependencies` wiping live edges — beads_rust behavior / operator footgun

## Follow-up Actions

- [ ] Hook: block unilateral `br defer` / `bd defer` (Tier 1)
- [ ] Skill update: bead-cycle + beads — no defer on ambiguous cleanup; age irrelevant by default
- [ ] Always-loaded: done — `no-unilateral-bead-deferral.mdc` (justify: immediate user request; hook not yet approved)
- [ ] Optional: commit dirty `.beads/issues.jsonl` restore + this post-mortem when user asks

```bash
# Dedup check before creating a tracker item:
br search "unilateral defer" 2>/dev/null | grep -q "." && echo "SIMILAR ITEM EXISTS — skip" || \
  br create --title="Hook: block unilateral br defer without explicit user request" \
    --description="Identified in post-mortem 2026-07-26-unilateral-bead-deferral" \
    --type task --priority 2
```

## Candidate Rules (for cm reflect)

- **Pattern**: "Never run br/bd defer unless the user explicitly requests deferral for named issues" (source: this post-mortem; also global mdc)
- **Pattern**: "Ticket age and br stale are not authorization to mutate queue membership" (source: this post-mortem)
- **Pattern**: "Encode task dependencies with br dep metadata; do not use defer as a substitute for blocking" (source: this post-mortem)

## cm Feedback

[cass: helpful none — cm context returned empty relevantBullets]
[cass: harmful none]

## cm Session Close

```bash
# no rule IDs from Phase 0a to mark
```

## Related Threads

- `stepdown-ci4` (closed this session)
- Deferred-then-restored: `stepdown-00h`, `8pt`, `v3a`, `kz4`, `bld`, `bru`, `74p`, `rls`
- Recreated: `stepdown-ls0`, `82a`, `s23`
- Global rule: `~/.agents/rules/global/no-unilateral-bead-deferral.mdc`
