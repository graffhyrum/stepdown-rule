# Stepdown Rule Analyzer

A TypeScript AST analyzer that enforces the stepdown rule for function organization in codebases. The stepdown rule organizes code from high-level concepts at the top to low-level implementation details at the bottom.

## Installation

```bash
npm install @stepdown/analyzer
# or
bun add @stepdown/analyzer
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

The rule: if function A calls function B, then B should appear before A in the file.

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
