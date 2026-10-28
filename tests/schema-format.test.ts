import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { formatJsonSchema } from "../scripts/format-json-schema";
import { FileConfigJsonSchema } from "../src/config/schema";

const repoRoot = resolve(import.meta.dir, "..");

test("formatJsonSchema output equals the committed stepdown-schema.json", async () => {
	expect(await formatJsonSchema(FileConfigJsonSchema)).toBe(readCommittedSchema());
});

test("formatJsonSchema is tab-indented and ends with a newline", async () => {
	const text = await formatJsonSchema({ a: { b: 1 } });
	expect(text).toBe('{\n\t"a": {\n\t\t"b": 1\n\t}\n}\n');
});

test("formatJsonSchema collapses short arrays like oxfmt", async () => {
	const text = await formatJsonSchema({ enum: ["x", "y"], required: ["a"] });
	expect(text).toBe('{\n\t"enum": ["x", "y"],\n\t"required": ["a"]\n}\n');
});

// Reads HEAD, not the working tree: the build rewrites the working file with the formatter itself.
function readCommittedSchema(): string {
	const result = Bun.spawnSync(["git", "show", "HEAD:stepdown-schema.json"], { cwd: repoRoot });
	return result.stdout.toString();
}
