---
"@stepdown/analyzer": patch
---

Respect `.stepdownrc.json` ignore patterns: CLI no longer overrides config ignore with an empty default, and basename glob patterns (e.g. `*.test.ts`) now match files in subdirectories.
