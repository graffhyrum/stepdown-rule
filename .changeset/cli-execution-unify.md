---
"@stepdown/analyzer": patch
---

Refactor CLI command execution: unify analyze/fix preflight (config + file resolution) into shared prepareAnalyze/prepareFix helpers used by both human and agents handlers.