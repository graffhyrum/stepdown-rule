# Subagent Assignments - Bug Beads

Assignments for parallel subagent execution. Each subagent MUST:
1. Load `subagent-workflow` skill
2. Use `bd update <bead-id> --status in_progress` at start
3. Run `bun run vet` and `bun test` before completion
4. Use `bd close <bead-id> --reason "Completed"` on success, or escalate

---

## P0 Bugs (Critical)

### stepdown-rule-1e0 - Fixer2: Dependency graph incompleteness
- **Category**: `coding`
- **Skills**: `subagent-workflow`
- **Prompt**:
  Fix the fixer's dependency graph in `src/fixer.ts`. `buildDependencyGraph` (lines 204-221) and `extractDependenciesFor` (line 229) do not capture all function relationships. Evidence: cart-composition.ts reports 'reordered 0 functions' yet `composeCartDomain` calls `sessionStoreToRepository`. The dependency extraction may miss call sites in factory functions that return objects with methods. Add recursive traversal or handle factory-return patterns so all callees are found. Run stepdown-rule on ff-elysia (or fixtures) to verify more violations get fixed.
- **Acceptance**: `extractDependenciesFor` finds deps inside returned object literals; cart-composition violations reduce.

### stepdown-rule-27g - Fixer1: Arrow functions in const declarations not properly reordered
- **Category**: `coding`
- **Skills**: `subagent-workflow`
- **Prompt**:
  Fix arrow function ordering in `src/fixer.ts`. Arrow functions like `const mapValidOrders = (...) => ...` are categorized but topological sort doesn't handle them correctly. Example: order-repository.ts has mapValidOrders (line 118) calling validateAndParseOrder (line 106) - violation persists. Ensure `categorizeVariableStatement` and `reorderFunctions` treat const-assigned arrow functions as reorderable, and topo sort places callees below callers per stepdown rule.
- **Acceptance**: order-repository.ts and wishlist-repository.ts violations in ff-elysia fix without creating new ones.

### stepdown-rule-96h - Fixer3: Reordering creates new violations (global opt)
- **Category**: `coding`
- **Skills**: `subagent-workflow`
- **Prompt**:
  The topological sort in fixer.ts (lines 261-298) does LOCAL optimization. Reordering to fix one caller creates NEW violations for other callers of the same callee. Implement ordering that minimizes total violations across ALL functions. Consider: when DAG has multiple valid orderings, choose the one that minimizes stepdown violations. May require violation-aware scoring in topo sort.
- **Acceptance**: Fix→analyze loop converges (violations decrease across runs, no ping-pong).

---

## P1 Bugs (High)

### stepdown-rule-0om - Fixer6: Fix/analyze loop non-idempotent
- **Category**: `coding`
- **Skills**: `subagent-workflow`
- **Prompt**:
  Running stepdown-rule then --fix repeatedly oscillates (22→27→22) instead of converging to 0. Root cause: Fixer3 (96h). Fix either by: (a) implementing 96h first (violation-minimizing topo sort), or (b) adding a convergence check: if fix increases violations, revert and try alternative ordering. Prefer fixing 96h; if blocked, add safeguard.
- **Acceptance**: Repeated fix runs reduce violations; eventually reaches stable state.

### stepdown-rule-hje - Fixer8: Analyzer and fixer use separate code paths
- **Category**: `coding`
- **Skills**: `subagent-workflow`
- **Prompt**:
  Fixer calls `analyzeFiles` but only uses file/violation counts - not the actual violations or call graph. `fixParsedFile` rebuilds deps via `extractDependenciesFor`. Refactor so fixer consumes analyzer's call graph/violations. Options: (1) Pass analysis result into fixer, use its dependency data; (2) Extract shared dependency extraction into a common module used by both. Ensure analyzer and fixer agree on what constitutes a violation.
- **Acceptance**: fixer uses analyzer output; no divergence between what analyzer reports and what fixer addresses.

### stepdown-rule-aka - Fixer7: Fixer only processes sourceFile direct children — DONE
- **Completed**: transformNestedBlocks reorders functions inside ArrowFunction/FunctionExpression/FunctionDeclaration bodies

### stepdown-rule-db8 - Fixer5: Nested/inline functions inside .derive() blocks not detected
- **Category**: `coding`
- **Skills**: `subagent-workflow`
- **Prompt**:
  Analyzer's `extractFunctions` (analyzer.ts 52-79) only looks at top-level. Functions inside `.derive()`, `.on()`, `.decorate()` callbacks are nested and not captured. Extend `visit()` to descend into call expression arguments when they contain function bodies. Example: session.ts line 39, ensureSessionCookie inside .derive(). Related: Fixer7 (aka) - fixer must also traverse these; consider fixing aka first for full pipeline.
- **Acceptance**: Analyzer reports violations for nested functions; fixer can reorder if aka is fixed.

### stepdown-rule-obe - Fixer4: Exported vs non-exported variable functions inconsistent — DONE
- **Completed**: removed hasExportModifier filter in extractFunctions, set isExported in createVariableFunctionInfo

### stepdown-rule-77q - Fix idempotency in ff-elysia tool
- **Category**: `coding`
- **Skills**: `subagent-workflow`
- **Prompt**:
  stepdown-rule run on ff-elysia is not idempotent. See ff-elysia-output.md. Requires cloning/running in ff-elysia project. Likely downstream of 0om/96h - if fix→analyze converges here, this may resolve. If 0om fixed, verify in ff-elysia; else document as blocked.
- **Acceptance**: stepdown-rule on ff-elysia converges (same output on repeated runs).

---

## Reference (no assignment)

### stepdown-rule-aad
Master taxonomy. Close when child beads (1e0, 27g, 96h, db8, aka, hje, 0om, obe) are resolved.

### stepdown-rule-uj1
Feature bead (P2). Defer.
