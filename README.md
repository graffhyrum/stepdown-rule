# Stepdown Rule Analyzer

A TypeScript AST analyzer that enforces the stepdown rule for function organization in codebases. The stepdown rule organizes code from high-level concepts at the top to low-level implementation details at the bottom.

## Installation

This is a local package. Clone and install it:

```bash
# Clone the repository
git clone https://github.com/graffhyrum/stepdown-rule.git
cd stepdown-rule

# Install dependencies
bun install

# Build the package
bun run build

# Link globally (optional, for CLI access)
bun link
```

### Local Usage in Another Project

After linking, use it in any project:

```bash
# Link the package in your project
cd /path/to/your-project
bun link @stepdown/analyzer
```

Then import and use programmatically:

```typescript
import { analyzeFiles, fixFiles } from "@stepdown/analyzer";
import { FileService } from "@stepdown/analyzer/services/FileService";

const fileService = new FileService();
const config = { ignore: [], fix: false, json: false };
const results = await analyzeFiles(["src/**/*.ts"], config, fileService);

console.log(results);
```

Or use the CLI:

```bash
stepdown-rule "src/**/*.ts"
```

## Usage

### CLI

```bash
# Analyze default (src/**/*.ts)
stepdown-rule

# Analyze specific files/globs
stepdown-rule analyze "src/**/*.ts" "lib/**/*.ts"

# Analyze a directory (auto-expands to **/*.ts)
stepdown-rule analyze src/

# Auto-fix violations
stepdown-rule fix

# Fix specific files
stepdown-rule fix "src/**/*.ts"

# Show circular dependencies (verbose mode)
stepdown-rule analyze --verbose

# JSON output for CI
stepdown-rule analyze --json

# Only run specific rules
stepdown-rule analyze --rules stepdown,nested

# Custom ignore patterns
stepdown-rule analyze --ignore "test/**/*" "generated/**/*"
```

### Programmatic

```typescript
import { analyzeFiles, fixFiles } from "@stepdown/analyzer";
import { FileService } from "@stepdown/analyzer/services/FileService";

const fileService = new FileService();
const config = { ignore: [], fix: false, json: false };
const results = await analyzeFiles(["src/**/*.ts"], config, fileService);

console.log(results);
```

## What is the Stepdown Rule?

The stepdown rule organizes functions in a file from high-level to low-level:

```typescript
// ✅ Good: Stepdown rule followed
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

The rule: within a scope, scope logic comes before subfunction declarations, and if function A calls function B, then A should appear before B in the file.

## How It Works

The analyzer reports **only actionable violations** - violations that can be fixed by reordering code. Violations involving functions in circular dependency cycles are excluded from reporting because reordering cannot fix them; they require refactoring.

### What Gets Reported

✅ **Reported**: Functions that call other functions appearing below them
- These can be fixed by moving the caller after the callee

❌ **Not Reported**: Functions involved in circular dependencies
- Example: `funcA → funcB → funcA` (mutual recursion)
- These require architectural changes, not reordering
- Often appear in tree traversal algorithms, mutual recursion patterns, or interconnected systems

### Circular Dependencies

Circular dependencies are always detected and reported separately. To understand what's creating cycles in your code:

```bash
stepdown-rule src/analyzer.ts
# Output shows both violations (fixable) and circular dependencies (architectural)
```

Circular dependencies do NOT prevent the fixer from running, but files with circular dependencies cannot be auto-fixed since reordering won't resolve them.

## Configuration

Create a `.stepdownrc.json` file (optional):

```json
{
  "$schema": "./stepdown-schema.json",
  "ignore": ["node_modules/**", "dist/**", "*.test.ts", "*.spec.ts"]
}
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `ignore` | `string[]` | `[]` | Additional glob patterns to ignore when analyzing files |

## CLI Options

- `patterns` - File patterns or directories to analyze (default: `src/**/*.ts`)
- `--verbose` - Show circular dependencies in output
- `--json` - Output results in JSON format
- `--rules <ids>` - Comma-separated rule IDs to run (available: `stepdown`, `nested`; default: all)
- `--ignore <patterns...>` - Additional ignore patterns
- `--config <file>` - Configuration file path (default: `.stepdownrc.json`)

## Development

```bash
bun install
bun run dev      # Run CLI from source
bun run build    # Build
bun test         # Test
bun run check    # Lint (biome)
bun run vet      # Full pipeline: build + typecheck + lint + test
```

## License

MIT
