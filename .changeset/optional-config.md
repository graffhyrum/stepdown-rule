---
"@stepdown/analyzer": patch
---

Return default config when config file not found

- Instead of throwing an error when config file is missing, return default config
- This makes the config file truly optional as documented
