# Rule Pipeline Architecture

Efficient pipeline: **parse AST once per file**, run all enabled rules' analyses on the shared context, then run each enabled rule's fix in sequence (so fixes see the result of previous fixes).

## Module / export name

| Item | Value |
|------|--------|
| Module | `src/pipeline.ts` |
| Export | `Pipeline` (object) |
| Entry | `Pipeline.run(options)` |
| Result type | `PipelineResult` (`analysisResults`, `fixResults`) |

Chosen name: **`Pipeline`** (not `RunPipeline`). Docs historically used `RunPipeline` as a use-case label; the concrete export is `Pipeline.run`. Mode is `"analyze" | "fix"`. Deps: `fileService`, optional `registry`, `config`, patterns.

As of stepdown-5x2.4.2, `Pipeline.run` owns the per-file Resolved→Parsed→Analyzed→Fixed loop. `analyzeFiles` / `fixFiles` / fixer `runPipeline` are thin facades over `Pipeline.run`. Mode (`"analyze" | "fix"`) is the only analyze/fix switch — Config has no `fix` flag. Rule application lives in `src/rule-fix.ts` so Pipeline does not import the fixer facades (no pipeline↔fixer cycle). `fixParsedFile` is deprecated; prefer `fixFileWithRules`.

---

## Approach

1. **Resolve** – Expand glob patterns to a list of file paths (one place; no per-rule I/O).
2. **Per file**
   - **Parse once** – Build a single AST and shared `RuleContext` (functions, call graph, dependency graph, etc.) used by every rule.
   - **Analyze all** – For each enabled rule, run `rule.analyze(ctx)`; collect violations per rule (no re-parse).
   - **Fix each** – If fixing: for each enabled rule that has a fix and reported violations, run `rule.fix(ctx, violations)` and replace file content with the result before the next rule’s fix. Order can be defined by the registry (e.g. stepdown then nested).
3. **Report** – Aggregate violations and fix results per file and overall.

Shared context keeps parsing and shared analysis (e.g. call graph) out of the inner loop; per-rule fix steps keep each fix simple and composable.

---

## State Diagram (per-file pipeline)

Lifecycle of a single file through the pipeline. The runner advances the file through these states; “Analyzed” and “Fixed” carry rule-specific payloads (violations, updated content).

```mermaid
stateDiagram-v2
  [*] --> Resolved: file path
  Resolved --> Parsing: read + parse
  Parsing --> Parsed: AST + RuleContext
  Parsed --> Analyzing: run enabled rules
  Analyzing --> Analyzed: violations per rule
  Analyzed --> Fixing: apply fixes in order
  Fixing --> Fixed: content updated
  Fixed --> [*]: write or skip
  Analyzed --> [*]: no fix requested
```

Optional: “Fixing” can be refined to one state per rule (e.g. FixingStepdown, FixingNested) if you want to show each fix step explicitly.

---

## High-Level Clean Architecture (class diagram)

- **Entities**: domain types (violations, function info, context) — no framework.
- **Use cases**: orchestration (run pipeline) and rule execution (analyze / fix).
- **Interface adapters**: rule registry, file service, config; they implement ports used by use cases.
- **Frameworks / drivers**: TypeScript compiler (AST), Bun (filesystem), CLI (argv).

Layers are grouped with [namespaces](https://mermaid.js.org/syntax/classDiagram.html) (class diagrams do not support subgraphs).

```mermaid
classDiagram
  namespace Entities {
    class RuleContext
    class FunctionInfo
    class Violation
    class FixResult
  }
  namespace useCases {
    class Pipeline
    class ParseAndBuildContext
    class ExecuteRules
  }
  namespace interfaceAdapters {
    class ViolationRule
    class RuleRegistry
    class FileService
    class ConfigLoader
  }
  namespace external {
    class TypeScriptAPI
    class BunFS
    class CLI
  }

  Pipeline --> ParseAndBuildContext
  Pipeline --> ExecuteRules
  Pipeline --> RuleRegistry
  Pipeline --> FileService
  Pipeline --> ConfigLoader
  ParseAndBuildContext --> RuleContext
  ParseAndBuildContext --> TypeScriptAPI
  ParseAndBuildContext --> FileService
  ExecuteRules --> ViolationRule
  ExecuteRules --> RuleContext
  ExecuteRules --> Violation
  ExecuteRules --> FixResult
  ExecuteRules --> FileService
  ViolationRule <|.. StepdownRule
  ViolationRule <|.. NestedRule
  RuleRegistry --> ViolationRule
  CLI --> Pipeline
  FileService --> BunFS
  ParseAndBuildContext --> BunFS

  ViolationRule : +id string
  ViolationRule : +analyze(ctx) Violation[]
  ViolationRule : +fix(ctx, violations) string
  RuleContext : +parsedFile
  RuleContext : +functions
  RuleContext : +callGraph
  RuleContext : +dependencyGraph
```

- **ViolationRule**: port/interface implemented by each rule (stepdown, nested, etc.); guarantees analyze + fix (or explicit report-only).
- **RuleRegistry**: holds enabled rules and order; used by `Pipeline.run` to decide which rules to run and in what order for the fix phase.
- **ParseAndBuildContext**: use case that reads the file (via `FileService`), parses with TypeScript, and builds the shared `RuleContext` once per file.
- **ExecuteRules**: use case that runs each enabled rule’s `analyze` on the same context, then runs each enabled rule’s `fix` in sequence, passing updated content to the next fix.

---

## Data flow (sequence)

```mermaid
sequenceDiagram
  participant CLI
  participant Pipeline
  participant FileService
  participant ParseAndBuildContext
  participant RuleRegistry
  participant Rule as ViolationRule

  CLI --> Pipeline: Pipeline.run(patterns, config, mode)
  Pipeline --> FileService: resolveFiles(patterns)
  FileService --> Pipeline: paths[]

  loop For each file
    Pipeline --> FileService: readFile(path)
    Pipeline --> ParseAndBuildContext: parse(content, path)
    ParseAndBuildContext --> Pipeline: ctx

    loop For each enabled rule
      Pipeline --> Rule: analyze(ctx)
      Rule --> Pipeline: violations[]
    end

    alt --fix and any violations
      loop For each enabled rule with fix
        Pipeline --> Rule: fix(ctx, violations)
        Rule --> Pipeline: newContent
        Pipeline --> Pipeline: content = newContent
      end
      Pipeline --> FileService: writeFile(path, content)
    end
  end

  Pipeline --> CLI: results
```

This matches the “parse once → all analyses → fixes of each enabled analyses” flow and keeps a single AST and shared context per file.
