# Stepdown Rule Analyzer

A TypeScript AST analyzer and fixer that enforces the stepdown rule: callers appear above callees, so high-level logic sits at the top of a file and low-level details at the bottom. It also catches nested function declarations that appear before logic inside a function body.

Built for TypeScript developers and teams who want consistent, top-down function organization without manual reordering. Ships as a CLI and a programmatic API. Runs on standalone binaries (~98 MiB, Bun runtime embedded) — no runtime install required.

## Why use it

- **Readable, top-down files**: entry points and high-level logic first; helpers and details last. Reading flows from concept to implementation.
- **Safe auto-fix**: `stepdown-rule fix` reorders functions via topological sort and rewrites only files that have violations.
- **Two rules, one tool**: the `stepdown` rule (module scope) and the `nested` rule (function body). Run either or both, independently.
- **Agent- and CI-friendly**: a stable JSON envelope (`stepdown-rule agents ...`) with documented exit codes and schemas.

## Install

### From GitHub Releases (recommended)

Standalone binaries for linux/darwin (x64 + arm64) and windows-x64, plus installers and `SHA256SUMS`. No Bun install required at runtime.

**Preferred (download → inspect → run):**

Unix (macOS / Linux):

```shell
curl -fsSL -o install.sh https://github.com/graffhyrum/stepdown-rule/releases/latest/download/install.sh
less install.sh   # review, then:
bash install.sh
```

Windows (PowerShell):

```powershell
Invoke-WebRequest -Uri https://github.com/graffhyrum/stepdown-rule/releases/latest/download/install.ps1 -OutFile install.ps1
# review install.ps1, then:
powershell -File .\install.ps1
```

Pin a version: `VERSION=v0.2.0 bash install.sh` or `$env:VERSION = 'v0.2.0'; powershell -File .\install.ps1`.

**Convenience pipe-to-shell (higher risk):**

```shell
curl -fsSL https://graffhyrum.github.io/stepdown-rule/install | bash
```

```powershell
irm https://graffhyrum.github.io/stepdown-rule/install.ps1 | iex
```

Then:

```shell
stepdown-rule --version
stepdown-rule "src/**/*.ts"
```

Trust model, channels, and integrity details: [docs/install-channels.md](docs/install-channels.md).

### From source (development)

```shell
git clone https://github.com/graffhyrum/stepdown-rule.git
cd stepdown-rule
bun install
bun run build
bun link
stepdown-rule --version
```

Host-native binary after build: `dist/stepdown-rule` (Unix) or `dist/stepdown-rule.exe` (Windows). Cross-compile all release targets: `bun run compile:release` → `dist/release/`.

### Programmatic API

```shell
cd path/to/your-project
bun link @stepdown/analyzer
```

```typescript
import { analyzeFiles, fixFiles } from "@stepdown/analyzer";
import { FileService } from "@stepdown/analyzer/services/FileService";

const fileService = new FileService();
const config = { ignore: [], json: false };
const results = await analyzeFiles(["src/**/*.ts"], config, fileService);
const fixes = await fixFiles({ patterns: ["src/**/*.ts"], config, fileService });

console.log(results, fixes);
```

## Quickstart

Analyze the default glob and fix what it finds:

```shell
stepdown-rule                       # analyze src/**/*.ts
stepdown-rule fix                  # reorder functions in place
stepdown-rule analyze --verbose    # also show circular dependencies
```

Verified to run from a clean checkout (`bun run dev` / `bun run dev fixtures/test-violations.ts`).

## Common commands

```shell
# Analyze specific files/globs
stepdown-rule analyze "src/**/*.ts" "lib/**/*.ts"

# Analyze a directory (auto-expands to **/*.ts)
stepdown-rule analyze src/

# Auto-fix violations
stepdown-rule fix "src/**/*.ts"

# JSON output for CI
stepdown-rule analyze --json

# Run only specific rules
stepdown-rule analyze --rules stepdown,nested

# Custom ignore patterns
stepdown-rule analyze --ignore "test/**/*" "generated/**/*"
```

Full option reference: `stepdown-rule --help` and `stepdown-rule help <command>`.

## Agents and automation

For coding agents and CI parsers, use the `agents` subcommand (stable JSON envelope on stdout). See [SKILL.md](SKILL.md) for workflows, exit codes, and decision trees.

```shell
stepdown-rule agents analyze 'src/**/*.ts'
stepdown-rule agents fix 'src/**/*.ts' --dry-run
stepdown-rule agents schema rules
```

## What is the stepdown rule?

Functions in a file are ordered from high-level to low-level: if function A calls function B, A appears before B. Logic comes before nested function declarations inside a function body.

```typescript
// ✅ Good: stepdown rule followed
function main() {
  const user = createUser("John", "john@example.com", "password123");
  console.log("User created:", user);
}

function createUser(name: string, email: string, password: string): User {
  if (!validateEmail(email)) throw new Error("Invalid email");
  const hashedPassword = hashPassword(password);
  return { id: Math.random().toString(36), name, email, password: hashedPassword };
}

function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password).digest("hex");
}
```

## How it works

The analyzer reports **only actionable violations** — violations fixable by reordering code. Functions involved in circular dependency cycles are excluded from reporting because reordering cannot fix them; they require refactoring.

- **Reported**: functions that call other functions appearing below them. Fixable by moving the caller after the callee.
- **Not reported**: functions in circular dependencies (e.g. `funcA → funcB → funcA`). These need architectural changes.
- Circular dependencies are always detected and reported separately (`--verbose` or `--json`). Files with cycles cannot be auto-fixed.

## Configuration

Optional `.stepdownrc.json`:

```json
{
  "$schema": "./stepdown-schema.json",
  "ignore": ["node_modules/**", "dist/**", "*.test.ts", "*.spec.ts"]
}
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `ignore` | `string[]` | `[]` | Additional glob patterns to ignore when analyzing files |

Override the config file path with `--config <file>`.

## Development

```shell
bun install
bun run dev      # Run CLI from source
bun run build    # Build
bun test         # Test
bun run lint     # Lint + format check (oxlint + oxfmt)
bun run vet      # Full pipeline: build + typecheck + lint + test
```

Architecture and pipeline details: [docs/rule-pipeline-architecture.md](docs/rule-pipeline-architecture.md). Project conventions for contributors: [AGENTS.md](AGENTS.md).

## License

MIT
