# Stepdown Rule Analyzer - Product Requirements Document

## Overview

A TypeScript AST analyzer that enforces the stepdown rule for function organization in codebases. The stepdown rule organizes code from high-level concepts at the top to low-level implementation details at the bottom.

## Problem Statement

Large TypeScript codebases often suffer from poor function organization, making code harder to read and maintain. Functions are scattered without logical hierarchy, with helper functions appearing before main logic and high-level concepts buried in implementation details.

## Solution

A CLI tool that analyzes TypeScript files and enforces the stepdown rule:

- Entry points and high-level functions appear first
- Mid-level abstractions follow
- Low-level implementation details appear last
- Dependencies flow downward (A calls B → B appears before A)

## Core Requirements

### Functional Requirements

#### 1. AST Analysis

- Parse TypeScript files using official TypeScript compiler API
- Identify function declarations and top-level arrow function variables
- Build call graph of function dependencies
- Detect stepdown rule violations

#### 2. Function Types Supported

- Function declarations: `function name() {}`
- Top-level arrow function variables: `const name = () => {}`
- Variable declarations with function expressions: `const name = function() {}`

#### 3. Analysis Scope

- Analyze all functions in each file
- Build complete call graph within file boundaries
- Handle circular dependencies (report as errors)
- Respect configurable ignore patterns

#### 4. Auto-Fix Capability

- Reorder functions to comply with stepdown rule
- Preserve comments, imports, and exports
- Maintain relative order of functions at same dependency level
- Handle cases where AFVs cannot be converted to function declarations

#### 5. Reporting

- Console output with color-coded errors
- JSON output for CI/CD integration
- Detailed violation information: file, line, function, dependency
- Progress indicator for large codebases

### Non-Functional Requirements

#### 1. Performance

- Process large codebases efficiently
- Minimal memory footprint
- Parallel processing where possible
- Configurable timeout for analysis

#### 2. Usability

- Simple CLI interface with clear help
- Extensible configuration via config file
- Sensible defaults
- Integration with existing tooling (oxlint, prettier)

#### 3. Compatibility

- TypeScript 5.0+
- Node.js 18+
- Works with existing project structures
- No runtime dependencies that conflict with common tooling

## User Interface

### CLI Commands

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

# Config file
stepdown-rule --config .stepdownrc.json
```

### Configuration (.stepdownrc.json)

```json
{
  "ignore": ["node_modules/**", "dist/**", "*.test.ts", "*.spec.ts"],
  "analyzeArrowFunctions": true,
  "analyzeExportsOnly": false,
  "reportCircularDependencies": true
}
```

## Technical Architecture

### Core Components

#### 1. Analyzer (`src/analyzer.ts`)

- TypeScript AST parsing
- Function extraction and classification
- Call graph building
- Violation detection

#### 2. Fixer (`src/fixer.ts`)

- Function reordering algorithm
- AST modification
- Source code reconstruction
- Comment preservation

#### 3. CLI (`src/cli.ts`)

- Command line interface
- File pattern resolution
- Output formatting
- Configuration loading

#### 4. Types (`src/types.ts`)

- Core type definitions
- AST node wrappers
- Violation data structures
- Configuration schema

### Algorithms

#### Call Graph Construction

1. Extract all function definitions with source positions
2. Analyze function bodies for function calls
3. Build directed graph: A → B if A calls B
4. Detect cycles (error condition)
5. Topological sort for ordering

#### Stepdown Validation

1. For each function, collect all dependencies
2. Verify dependencies appear before the function
3. Report violations with context
4. Provide suggested ordering if fixable

#### Auto-Fix Algorithm

1. Build dependency graph
2. Perform topological sort
3. Group functions by dependency level
4. Reconstruct file preserving structure
5. Handle AFV conversion constraints

## Error Handling

### Circular Dependencies

- Report as errors (cannot be auto-fixed)
- Provide cycle visualization
- Suggest manual refactoring approach

### Unfixable AFVs

- Detect when AFVs cannot be converted to function declarations
  - Uses `this` keyword
  - Closes over external variables
  - In class/object context
- Report violations but skip auto-fix

### Syntax Errors

- Skip files with TypeScript syntax errors
- Report files that couldn't be parsed
- Continue processing other files

## Testing Strategy

### Unit Tests

- AST parsing accuracy
- Call graph construction
- Violation detection logic
- Fix algorithm correctness

### Integration Tests

- End-to-end CLI workflows
- Large codebase performance
- Configuration file handling
- Error scenarios

### Fixture Tests

- Real-world code examples
- Edge cases and corner cases
- Performance benchmarks

## Success Metrics

### Code Quality

- Reduced cognitive complexity in analyzed files
- Improved readability scores
- Fewer violations over time in codebases

### Tool Adoption

- Integration with popular linters/formatters
- Community contributions and issues
- Performance benchmarks vs alternatives

### Developer Experience

- Fast analysis times (<1s per 1000 LOC)
- Clear error messages
- Smooth integration into existing workflows

## Future Enhancements

### v1.1

- Cross-file analysis
- IDE integration (VS Code extension)
- Pre-commit hooks

### v1.2

- More granular configuration options
- Custom rule definitions
- Performance profiling

### v2.0

- Support for other languages (JavaScript, TSX)
- Advanced refactoring suggestions
- ML-based ordering recommendations

## Dependencies

### Runtime

- `typescript` - Official TypeScript compiler API
- `commander` - CLI framework
- `glob` - File pattern matching
- `picocolors` - Terminal colors

### Development

- `oxlint` - Linting
- `bun` - Build tool and runtime
- TypeScript 5.0+ - Type checking

## Delivery

### Phase 1: Core Analysis (Week 1-2)

- AST parsing and function extraction
- Call graph construction
- Basic violation detection

### Phase 2: CLI and Reporting (Week 2-3)

- Command line interface
- Console and JSON output
- Configuration system

### Phase 3: Auto-Fix (Week 3-4)

- Function reordering
- Comment preservation
- AFV handling

### Phase 4: Testing & Polish (Week 4-5)

- Comprehensive test suite
- Performance optimization
- Documentation

## Risk Mitigation

### Technical Risks

- **AST Complexity**: Use TypeScript compiler API (stable, well-documented)
- **Performance**: Implement efficient algorithms, add benchmarks
- **Edge Cases**: Comprehensive test coverage, real-world fixtures

### Adoption Risks

- **Breaking Changes**: Version carefully, maintain backward compatibility
- **Integration**: Standard output formats, easy CLI integration
- **Documentation**: Clear examples, integration guides
