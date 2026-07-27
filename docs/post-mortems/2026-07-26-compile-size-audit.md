# Compile Size Audit (2026-07-26)

Host: Windows x64. Entry: `src/cli.ts`. Smoke: `--version` + `analyze fixtures/test-correct.ts --json`.

| Variant | Flags | Bytes | MiB | Pass |
|---------|-------|------:|----:|:----:|
| A-baseline | `--compile` | 107,869,696 | 102.87 | yes |
| B-minify | `--compile --minify` | 102,449,664 | 97.70 | yes |
| C-minify-sourcemap | `--compile --minify --sourcemap` | 106,810,880 | 101.86 | yes |
| D-minify-bytecode | `--compile --minify --bytecode` | — | — | no (top-level await) |

**Winner: B-minify** (−5.17 MiB vs baseline). Sourcemap costs ~4.16 MiB. Bytecode incompatible with CLI top-level await.

Floor remains ~98 MiB (embedded Bun runtime + TypeScript). Ship `--minify` without sourcemap/bytecode for release and local native builds.

Re-run: `bun run compile:bench`.
