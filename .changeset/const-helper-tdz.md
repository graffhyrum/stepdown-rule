---
"@stepdown/analyzer": patch
---

Nested-block rule no longer moves `const`/`let` arrow or function-expression helpers that logic reaches only through another nested helper. This removes a false positive and stops `fix` from placing them after `return`, where they are never initialized (TDZ error).
