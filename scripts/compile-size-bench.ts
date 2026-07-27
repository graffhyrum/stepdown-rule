/**
 * One-shot size audit for bun --compile flag variants.
 * Usage: bun scripts/compile-size-bench.ts
 */
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { resolveCompiledPath } from "./compile-native";

type Variant = {
	id: string;
	flags: string[];
};

const variants: Variant[] = [
	{ id: "A-baseline", flags: [] },
	{ id: "B-minify", flags: ["--minify"] },
	{ id: "C-minify-sourcemap", flags: ["--minify", "--sourcemap"] },
	{ id: "D-minify-bytecode", flags: ["--minify", "--bytecode"] },
];

const outDir = path.join("dist", "size-bench");
await mkdir(outDir, { recursive: true });

async function findBinary(outfile: string): Promise<string | undefined> {
	for (const candidate of resolveCompiledPath(outfile)) {
		if (await Bun.file(candidate).exists()) {
			return candidate;
		}
	}
	return undefined;
}

const results: { id: string; bytes: number; mb: string; versionOk: boolean; analyzeOk: boolean }[] =
	[];

for (const variant of variants) {
	const baseName = `stepdown-rule-${variant.id}`;
	const outfile = path.join(outDir, baseName);
	const args = ["build", "--compile", ...variant.flags, "src/cli.ts", "--outfile", outfile];
	console.log(`\n=== ${variant.id}: bun ${args.join(" ")}`);
	const proc = Bun.spawn(["bun", ...args], { stdout: "inherit", stderr: "inherit" });
	const exitCode = await proc.exited;
	if (exitCode !== 0) {
		console.error(`FAILED compile: ${variant.id}`);
		results.push({
			id: variant.id,
			bytes: -1,
			mb: "FAIL",
			versionOk: false,
			analyzeOk: false,
		});
		continue;
	}

	const binaryPath = await findBinary(outfile);
	if (!binaryPath) {
		console.error(`Missing binary for outfile: ${outfile}`);
		results.push({
			id: variant.id,
			bytes: -1,
			mb: "MISSING",
			versionOk: false,
			analyzeOk: false,
		});
		continue;
	}

	const bytes = Bun.file(binaryPath).size;
	const mb = (bytes / (1024 * 1024)).toFixed(2);
	const versionProc = Bun.spawn([binaryPath, "--version"], {
		stdout: "pipe",
		stderr: "pipe",
	});
	const versionOk = (await versionProc.exited) === 0;

	const analyzeProc = Bun.spawn([binaryPath, "analyze", "fixtures/test-correct.ts", "--json"], {
		stdout: "pipe",
		stderr: "pipe",
	});
	const analyzeOk = (await analyzeProc.exited) === 0;

	results.push({
		id: variant.id,
		bytes,
		mb,
		versionOk,
		analyzeOk,
	});
	console.log(
		`${variant.id}: ${bytes} bytes (${mb} MiB) version=${versionOk} analyze=${analyzeOk}`,
	);
}

console.log("\n=== SIZE BENCH SUMMARY ===");
console.log("| Variant | Bytes | MiB | --version | analyze |");
console.log("|---------|-------|-----|-----------|---------|");
for (const r of results) {
	console.log(`| ${r.id} | ${r.bytes} | ${r.mb} | ${r.versionOk} | ${r.analyzeOk} |`);
}

const ok = results.filter((r) => r.bytes > 0 && r.versionOk && r.analyzeOk);
if (ok.length === 0) {
	process.exit(1);
}
const smallest = ok.reduce((a, b) => (a.bytes <= b.bytes ? a : b));
console.log(`\nSmallest passing: ${smallest.id} (${smallest.mb} MiB)`);
