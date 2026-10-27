---
"@stepdown/analyzer": patch
---

Nested-block rule no longer moves a `const`/`let` arrow or function-expression helper that logic, or another helper that stays in place, reads in any way: a call, an alias such as `const fn = helper`, an argument, or an object or array literal. This removes a false positive and stops `fix` from placing such helpers after `return`, where they are never initialized (TDZ error). A statement that declares several helpers at once is also no longer moved.
