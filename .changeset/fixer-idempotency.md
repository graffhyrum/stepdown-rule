---
"@stepdown/analyzer": patch
---

Improve fixer idempotency and reordering accuracy

- Fixer now produces consistent output across multiple runs
- Enhanced topological sorting for complex dependency chains
- Better handling of mixed function types (declarations and arrow functions)
- Files already compliant remain unchanged on subsequent fixes
