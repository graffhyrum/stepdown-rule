---
"@stepdown/analyzer": minor
---

Refactor: extract ast-utils, async FileService, fixer helpers

- Add ast-utils (isFunctionLike, getPosition, getPositionFromOffset) shared by analyzer and fixer
- FileService.parseFile/readFile/writeFile now async (Bun.file), IFileService interface updated
- Fixer: createUnfixedResult helper, async processAnalysisResult/fixFile
- Config loader: fix schema import path, getFullConfigJsonSchema synchronous
