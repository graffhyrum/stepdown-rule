---
"@stepdown/analyzer": patch
---

Refactor AST visitor typing: CategorizedNodes now holds ts.Statement arrays, removing casts in reconstructStatements; add coverage for function-expression nested reorder.