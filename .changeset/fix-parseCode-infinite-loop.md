---
"@stepdown/analyzer": patch
---

Fix infinite loop in unified-modules tests caused by parseCode recursively calling itself instead of ts.createSourceFile
