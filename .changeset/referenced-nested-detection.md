---
"@stepdown/analyzer": minor
---

Add referenced nested function detection

- Skip violation reporting when nested function is referenced in parent function body
- Add helper functions: isReferencedInFunctionBody, findFunctionNode, containsIdentifierExcludingNestedDeclaration
- Update tests to verify no violations when nested functions are referenced in return statements or logic
