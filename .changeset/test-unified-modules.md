---
type: patch
---

Add comprehensive test coverage for unified modules (ast-graph-builder, graph-algorithms, ast-node-visitors)

- Created tests/unified-modules.test.ts with 30 focused tests (492 LOC)
- Achieved 100% function coverage for all three new modules
- Tests cover:
  - Function name extraction from declarations and variable statements
  - Dependency graph building with automatic deduplication
  - Call graph construction and position tracking
  - Topological sorting with cycle detection and source-order preservation
  - Circular dependency identification and filtering
  - AST node categorization (imports/functions/exports/other) and reconstruction
  - Tree traversal and predicate-based node finding
- All 92 tests pass (30 new + 62 existing)
- Fixed biome linting violations in test code (removed non-null assertions, used type guards)
- Reordered ast-graph-builder.ts functions to follow stepdown rule (high-level calls before low-level implementations)
