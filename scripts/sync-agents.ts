/**
 * Copy CLAUDE.md → AGENTS.md so agent loaders get full instructions on
 * Windows (git symlinks often checkout as a plain stub when core.symlinks=false).
 */
const source = await Bun.file("CLAUDE.md").text();
await Bun.write("AGENTS.md", source);
console.log("Synced AGENTS.md from CLAUDE.md");
