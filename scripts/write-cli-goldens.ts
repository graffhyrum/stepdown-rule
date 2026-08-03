import { writeFileSync } from "node:fs";
import { registerDefaultRules } from "../src/register-default-rules";
import { clear } from "../src/registry";
import { runCli } from "../tests/cli-harness";

clear();
registerDefaultRules();

const cases = [
	["clean", "fixtures/clean.ts"],
	["stepdown-violation", "fixtures/stepdown-violation.ts"],
] as const;
const formats = ["human", "json", "agents"] as const;

for (const [name, path] of cases) {
	for (const fmt of formats) {
		const r = await runCli(["analyze", path, "--format", fmt]);
		writeFileSync(`tests/goldens/analyze-${name}-${fmt}.txt`, r.stdout);
		writeFileSync(`tests/goldens/analyze-${name}-${fmt}.exit`, String(r.exitCode));
	}
}
console.log("wrote goldens");
