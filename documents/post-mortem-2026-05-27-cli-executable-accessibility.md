# Post-Mortem: CLI Executable Not Accessible Across Projects (stepdown-rule)

**Date**: 2026-05-27
**Duration**: Investigation + fix implementation (~1h)
**Participants**: Agent + user
**Status**: Fix implemented; RCA documented
**Related**: User pain using `stepdown-rule` from jobAppTracker fastvet script; desire for system-wide durable access.

## Executive Summary

The `stepdown-rule` CLI (bin name) was only "available" to other projects on the same machine via `bun link` + reliance on `~/.bun/bin` being in `$PATH` and a `#!/usr/bin/env bun` shebang inside the bundled `dist/cli.js`. The package is `"private": true`, the build only emitted a JS bundle, and downstream projects (e.g. jobAppTracker) invoked the bare command name in `package.json` scripts. This produced fragile, non-portable, Bun-linker-dependent behavior that broke in IDEs, fresh environments, after source moves, or without explicit link steps. The durable fix: make the build emit a self-contained native executable (`bun build --compile`) and point `bin` at it.

## Root Cause Analysis (RCA)

### Primary Causes (Why "not working" / not durable)

1. **Shebang + runtime discovery fragility**
   - `src/cli.ts` and the emitted `dist/cli.js` start with `#!/usr/bin/env bun`.
   - Execution requires the `bun` executable to be found via the system `env` mechanism at the moment the shell/kernel interprets the script.
   - Fails (or behaves differently) in:
     - IDE terminal integrations / run configurations (WebStorm, VSCode) that don't fully inherit login shell PATH.
     - Git hooks, pre-commit, CI containers, or `npm script` contexts with sanitized env.
     - Machines where bun is installed via asdf/nvm/fnm or only in interactive shells.
   - The global shim created by `bun link` (`~/.bun/bin/stepdown-rule` → global node_modules copy of `dist/cli.js`) still carried the shebang, so the problem was only deferred.

2. **Distribution mechanism tied to bun's private global linker**
   - `bun link` (documented in README) creates symlinks inside `~/.bun/install/global/node_modules/@stepdown/analyzer` → source tree + a direct bin shim in `~/.bun/bin`.
   - This is:
     - Invisible to non-bun tools and to `npm`/`pnpm`/`yarn` ecosystems.
     - State that can be invalidated by `bun unlink`, bun upgrades, moving the checkout, or multiple clones.
     - Not reproducible on another developer's machine without the exact same steps + PATH setup.
   - At one point a full recursive copy (not symlink) had been placed in the global store via `bun install -g`, creating a massive stale snapshot (entire src + .git + node_modules copied).

3. **"private": true + no published artifact**
   - Prevented `bun add -g @stepdown/analyzer` or `npm install -g`.
   - Consumers could only ever use the `file:...` specifier (brittle absolute/relative paths) or the manual link dance.
   - No registry fallback for "just make the command appear".

4. **Build only produced a JS bundle**
   - `scripts/build.ts` ran `Bun.build(..., { target: "node" })` → single ~9 MiB `dist/cli.js` that still needed a bun interpreter.
   - No standalone artifact that could be dropped into `~/bin` or `/usr/local/bin` and just work.
   - `package.json#bin` pointed at the interpreter-dependent JS file.

5. **Implicit global dependency in consuming projects**
   - jobAppTracker `package.json` scripts contained bare `stepdown-rule fix ... && stepdown-rule analyze ...` (and `rule-validator`).
   - These assume the command is already on `$PATH` globally rather than declaring an explicit devDep + using the local `./node_modules/.bin` (which would have been hermetic and `bun run` friendly).
   - Secondary: `rule-validator` (an internal `scripts/*.ts` with no `bin` entry) was referenced the same way, guaranteeing "command not found".

### Contributing Factors

- README only documented the `bun link` path; no "here is the single binary you can put in PATH forever" story.
- No `build:bin` or compile step; the project already knew how to do `bun build --compile` (jobAppTracker itself uses it for its server binary).
- Top-level-await + ESM + Bun.* APIs (Bun.file/Bun.write in FileService + config/loader) made a plain-Node fallback impossible without a launcher, reinforcing the need for either "bun present" or a compiled bundle that embeds the runtime.

## What Went Well ✅

1. Rapid reproduction: `which stepdown-rule`, inspecting the symlink chain, running the command while `cd`'d into jobAppTracker, and observing both success and the architectural smell (hardcoded global assumption) were immediate.
2. Correct diagnosis of the shebang + bun-link coupling as the durable-access blocker (not just "user forgot to link").
3. Proof-of-concept compile was trivial (`bun build --compile src/cli.ts --outfile /tmp/sdr-test`) and produced a working 100 MiB ELF that ran from the foreign project tree with zero Bun on the shebang path.
4. The change is additive: `dist/cli.js` is still emitted for the internal `custom-hooks` script and any consumers that want the JS entrypoint.

## The Fix (Durable Solution Implemented)

1. **scripts/build.ts** — added a `bun build --compile src/cli.ts --outfile ./dist/stepdown-rule` step (with error checking). Runs as part of the normal `bun run build`.
2. **package.json** — changed `"bin": { "stepdown-rule": "./dist/stepdown-rule" }`. The native binary is now what `bun link`, local `file:` installs, and direct PATH symlinks all expose.
3. **README.md** — rewrote the Installation section:
   - Prominent "System-wide CLI (recommended)" subsection explaining the compiled binary, `~/bin` pattern, and `export PATH`.
   - Clarified that `bun link` still works (and now delivers the native binary).
   - Separated "programmatic API via link" from the now-trivial global CLI usage.
4. **Verification**:
   - Full rebuild succeeds and emits both artifacts.
   - Binary is ELF +x, ~100 MiB.
   - Invoked directly from `/home/graff/WebstormProjects/jobAppTracker` against its `src/` — works, produces correct analysis JSON, zero violations.
   - `stepdown-rule --version` etc. all functional.

Result: A developer can now:
- Build once in the stepdown-rule checkout.
- `ln -sf .../dist/stepdown-rule ~/bin/stepdown-rule`
- Delete or move the source tree.
- Use the command from every other project (or IDE task, hook, etc.) with a normal PATH entry and **no Bun shebang resolution**.

Updating the tool on the machine reduces to: `cd stepdown-rule && git pull && bun run build && ln -sf ...` (or keep the symlink pointed at the build output inside the tree).

## What Could Improve / Follow-ups ⚠️

1. **Size** — 100 MiB is large for a dev tool (embeds full TS, arktype, commander, glob, etc.). Future work could investigate tree-shaking the compile or splitting the analyzer core from the CLI binary.
2. **Cross-platform distribution** — `--compile` is platform-specific. If the tool is ever published, we would need a matrix (or keep publishing the JS + a postinstall compile script).
3. **rule-validator** — Still an un-declared global in jobAppTracker's fastvet. Either give it its own bin entry + document it, or convert the downstream reference to an explicit `bun run` invocation against a known path (or remove the coupling).
4. **Keep cli.js shebang?** — The JS bundle still contains `#!/usr/bin/env bun`. If we ever want `node` fallback for the non-compiled path we would need a small launcher, but with the native binary as the blessed entry this is now irrelevant.
5. **PATH best practices** — Consider adding a `bin/install-global` convenience script (or npm "postbuild" that prints the ln command) so the one-liner is even more obvious.

## Key Artifacts Changed

- scripts/build.ts:14 (added compile step)
- package.json:21 (bin pointer)
- README.md (installation narrative)
- New: documents/post-mortem-2026-05-27-cli-executable-accessibility.md (this file)

## Timeline / Commands Run

- Reproduced via `which`, `readlink -f`, `cd jobAppTracker && stepdown-rule ...`
- Tested `bun build --compile` in /tmp and against real foreign src/
- Implemented the three code/docs edits
- `bun run build` + cross-cwd smoke tests of the resulting binary

The executable is now a first-class, relocatable artifact instead of a side-effect of bun's package linker. This matches the project's own usage of `--compile` for its production server binary and satisfies the user's request for accessibility "to any project on my system."
