# @stepdown/analyzer

## 0.3.0

### Minor Changes

- 69a6958: GitHub Release multi-target minify compile + Pages install one-liners (install.sh / install.ps1).

### Patch Changes

- 602f33d: Document simplify-review remediations and unilateral bead-deferral process failure.
- 63dfc13: Register default rules in rule-fix-coverage tests so coverage runs see stepdown/nested.
- 4fc3f56: Commit SpecStory session history for agent effectiveness meta-analysis.
- 13906d8: Sync beads issues (restore deferred tickets, add typecheck scripts bead) and ignore write.lock/\*.tmp.
- 7f02283: Fix Windows FileService globs/ignores via posix path normalization and post-filter.
- dfc8c95: Windows-safe tooling: LF gitattributes, portable remove-buildinfo/sync-agents, bin→cli.js, Cursor stop→vet hook.

## 0.2.0

### Minor Changes

- fd9e08f: Add `agents` CLI subcommands (`analyze`, `fix`, `schema`) with a stable JSON envelope, semantic exit codes, and `--dry-run` fix preview. Harden human `analyze`/`fix` for automation (stderr diagnostics, exit codes, JSON fixes). Ship `SKILL.md` for agent workflows.
- af18a54: Refactor CLI to use CommanderJS subcommands (`analyze` and `fix`) instead of flat structure with `--fix` flag. This provides better organization and follows Git-style CLI conventions.
- 051d012: Add CLI --rules option for selective rule execution
- 046aa36: Update contributor and user docs to reflect Oxlint and Oxfmt commands and vet pipeline behavior.
- b66acc9: Add documentation for rule pipeline architecture and class diagram
- 7d52c44: Add nested function analysis feature

  - Detect nested function declarations that appear before logic statements within parent functions
  - Track parent-child function relationships via new `parentFunction` field in FunctionInfo
  - New NestedFunctionViolation type for reporting violations
  - Support both function declarations and arrow functions within parent scopes
  - Logic statements (non-function declarations) must precede nested function definitions

- 5bf9c51: Add CLAUDE.md with consolidated project guidance. Combines project conventions, architecture overview, CLI commands, and Beads workflow integration. Includes post-mortem documentation of the consolidation from separate AGENTS.md and CLAUDE.md files into a single source of truth.
- d208def: Refactor: extract ast-utils, async FileService, fixer helpers

  - Add ast-utils (isFunctionLike, getPosition, getPositionFromOffset) shared by analyzer and fixer
  - FileService.parseFile/readFile/writeFile now async (Bun.file), IFileService interface updated
  - Fixer: createUnfixedResult helper, async processAnalysisResult/fixFile
  - Config loader: fix schema import path, getFullConfigJsonSchema synchronous

- 2ce4751: Add referenced nested function detection

  - Skip violation reporting when nested function is referenced in parent function body
  - Add helper functions: isReferencedInFunctionBody, findFunctionNode, containsIdentifierExcludingNestedDeclaration
  - Update tests to verify no violations when nested functions are referenced in return statements or logic

- ab5c5a2: Remove unused `canBeFunctionDeclaration` field from `FunctionInfo` and 13 supporting functions that computed it. The field was never read by any consumer.
- 7cf7ebf: Implement rule pipeline architecture: ViolationRule interface, RuleContext, rule registry, StepdownRule and NestedRule implementations for pluggable analysis and fixing

### Patch Changes

- 34fee50: Close completed beads: rule pipeline epic and child tasks
- 51dcedb: Add beads task tracking workflow

  - Add .beads directory with configuration for task tracking
  - Add .gitattributes for consistent git behavior

- 2b735eb: Update lock files and configuration files
- 41f177c: Replace Biome with Oxlint and Oxfmt in project scripts and config for linting and formatting workflows.
- aa507bb: Update CLI output to display nested function violations

  - Add formatted output for nested function violations in analysis results
  - Include parent function location information in violation reports
  - Display violation count in summary output

- f532695: Remove "Landing the Plane" section from AGENTS.md documentation
- 5835251: Reorganize project documentation and remove placeholder files

  - Move PRD.md to docs/ directory for better organization
  - Remove placeholder index.ts file
  - Update README.md with installation and usage instructions

- c81cd6c: Add documentation step to Landing the Plane workflow in AGENTS.md
- 51dcedb: Update documentation

  - Add session completion protocol to AGENTS.md
  - Clarify config file as optional in README.md

- caa91d4: Fix circular dependency output duplicating closing node (e.g., `A → B → C → A → A` now correctly displays as `A → B → C → A`)
- 5f0da98: Fix CLI summary showing "Found 0 violations" when only circular dependencies exist. Now separately reports violations and circular dependencies.
- 47f8b61: Fix infinite loop in unified-modules tests caused by parseCode recursively calling itself instead of ts.createSourceFile
- 3d194a4: Improve fixer idempotency and reordering accuracy

  - Fixer now produces consistent output across multiple runs
  - Enhanced topological sorting for complex dependency chains
  - Better handling of mixed function types (declarations and arrow functions)
  - Files already compliant remain unchanged on subsequent fixes

- 96ba89d: Format stepdown-schema.json with consistent 2-space indentation
- 05b2c54: Format verbose option constructor for readability.
- 0b60479: Return default config when config file not found

  - Instead of throwing an error when config file is missing, return default config
  - This makes the config file truly optional as documented

- 34349d2: Add tests for rule pipeline architecture: registry, rule-context, stepdown/nested rules, and pipeline integration
- 70a78f3: Reformat code to comply with stepdown rule and improve readability. Functions are now properly ordered with callers above callees, and long parameter lists are wrapped for better readability across analyzer, ast-node-visitors, and fixer modules.
- c62d5df: Test suite consolidation

  - Remove analyzer-edge-cases, analyzer-specific-lines, fixer-error-cases (redundant)
  - Update analyzer, fixer, idempotency, nested-functions, analyzer-fixer-unified tests for refactored APIs

- 99304a5: Expand test coverage for nested functions and idempotency

  - Add comprehensive idempotency tests for fixer functionality
  - Verify fixer produces stable output across multiple runs
  - Test complex dependency chains and mixed function types
  - Update nested function test fixtures with improved coverage

- 12a1c58: Optimize test suite by eliminating unnecessary file I/O, parallelizing fixture loops, and extracting shared helpers
- e2ad4b1: Add comprehensive test coverage for unified modules (ast-graph-builder, graph-algorithms, ast-node-visitors)

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

- 99cac77: Add tooling configs: Cursor rules, Sisyphus workflow, Specstory history
