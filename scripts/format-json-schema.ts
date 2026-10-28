import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dir, "..");
const oxfmtBin = resolve(repoRoot, "node_modules/.bin/oxfmt");

// Delegates to the repo's oxfmt so the output matches `bun run lint` (e.g. short arrays collapse
// onto one line) and a build does not dirty the tracked schema file.
export async function formatJsonSchema(schema: unknown): Promise<string> {
	const proc = Bun.spawn([oxfmtBin, "--stdin-filepath", "schema.json"], {
		cwd: repoRoot,
		stdin: new TextEncoder().encode(`${JSON.stringify(schema, null, "\t")}\n`),
		stdout: "pipe",
		stderr: "pipe",
	});
	const [text, errText, exitCode] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);
	if (exitCode !== 0) throw new Error(`oxfmt failed (${exitCode}): ${errText}`);
	return text;
}
