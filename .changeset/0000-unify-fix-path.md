---
"@stepdown/analyzer": minor
---

Unify the fix path: `fixFiles` takes an options object, Config drops the unused `fix` flag (Pipeline `mode` is the switch), and `fixFileWithRules` lives in `rule-fix` so Pipeline no longer cycles with the fixer facades. `fixParsedFile` is deprecated.
