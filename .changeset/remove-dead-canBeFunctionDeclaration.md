---
"@stepdown/analyzer": minor
---

Remove unused `canBeFunctionDeclaration` field from `FunctionInfo` and 13 supporting functions that computed it. The field was never read by any consumer.
