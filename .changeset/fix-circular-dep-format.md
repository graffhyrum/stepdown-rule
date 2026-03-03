---
"@stepdown/analyzer": patch
---

Fix circular dependency output duplicating closing node (e.g., `A → B → C → A → A` now correctly displays as `A → B → C → A`)
