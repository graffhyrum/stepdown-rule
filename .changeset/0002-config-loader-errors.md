---
"@stepdown/analyzer": patch
---

Separate config file I/O from JSON parse and schema validation so missing files still fall back to defaults without masking parse errors.
