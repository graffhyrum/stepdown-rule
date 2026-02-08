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

const results = await analyzeFiles(["src/**/*.ts"], {
  analyzeArrowFunctions: true,
  analyzeExportsOnly: false,
  reportCircularDependencies: true,
});

console.log(results);
```

Or use the CLI:

```bash
stepdown-rule "src/**/*.ts"
```

## Usage

### CLI

```bash
# Analyze current directory
stepdown-rule

# Analyze specific files/globs
stepdown-rule "src/**/*.ts" "lib/**/*.ts"

# Auto-fix violations
stepdown-rule --fix

# JSON output for CI
stepdown-rule --json --output-file results.json

# Custom ignore patterns
stepdown-rule --ignore "test/**/*" "generated/**/*"
```

### Programmatic

```typescript
import { analyzeFiles, fixFiles } from "@stepdown/analyzer";

const results = await analyzeFiles(["src/**/*.ts"], {
  analyzeArrowFunctions: true,
  analyzeExportsOnly: false,
  reportCircularDependencies: true,
});

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

The rule: if function A calls function B, then A should appear before B in the file.

## Configuration

Create a `.stepdownrc.json` file:

```json
{
  "$schema": "./stepdown-schema.json",
  "ignore": ["node_modules/**", "dist/**", "*.test.ts", "*.spec.ts"],
  "analyzeArrowFunctions": true,
  "analyzeExportsOnly": false,
  "reportCircularDependencies": true
}
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `ignore` | `string[]` | `[]` | Array of glob patterns to ignore when analyzing files |
| `analyzeArrowFunctions` | `boolean` | `true` | Whether to analyze arrow functions for stepdown violations |
| `analyzeExportsOnly` | `boolean` | `false` | Whether to only analyze exported functions |
| `reportCircularDependencies` | `boolean` | `true` | Whether to report circular dependencies |

## CLI Options

- `patterns` - File patterns to analyze (default: `src/**/*.ts`)
- `--fix` - Automatically fix violations by reordering functions
- `--json` - Output results in JSON format
- `--output-file <file>` - Write JSON output to file
- `--ignore <patterns...>` - Additional ignore patterns
- `--config <file>` - Configuration file path

## Development

```bash
bun install
bun run dev # Run CLI
bun run build # Build
bun run test # Test
bun run lint # Lint
```

## License

MIT
