---
"@stepdown/analyzer": minor
---

Add nested function analysis feature

- Detect nested function declarations that appear before logic statements within parent functions
- Track parent-child function relationships via new `parentFunction` field in FunctionInfo
- New NestedFunctionViolation type for reporting violations
- Support both function declarations and arrow functions within parent scopes
- Logic statements (non-function declarations) must precede nested function definitions
