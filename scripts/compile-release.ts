import { createHash } from "node:crypto";
import { mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import {
	compileNativeCli,
	RELEASE_COMPILE_TARGETS,
	releaseAssetName,
	releaseOutfile,
} from "./compile-native";

await mkdir("dist/release", { recursive: true });

for (const target of RELEASE_COMPILE_TARGETS) {
	const asset = releaseAssetName(target);
	console.log(`Compiling ${target} → ${asset}`);
	const compiled = await compileNativeCli({ target, outfile: releaseOutfile(target) });
	console.log(`  wrote ${compiled}`);
}

const releaseDir = "dist/release";
const expectedAssets = new Set(RELEASE_COMPILE_TARGETS.map(releaseAssetName));
const entries = (await readdir(releaseDir))
	.filter((name) => name.startsWith("stepdown-rule-") && name !== "SHA256SUMS")
	.sort();

const missing = [...expectedAssets].filter((name) => !entries.includes(name));
const unexpected = entries.filter((name) => !expectedAssets.has(name));
if (missing.length > 0 || unexpected.length > 0) {
	throw new Error(
		`Release assets mismatch. missing=[${missing.join(", ")}] unexpected=[${unexpected.join(", ")}]`,
	);
}

const lines: string[] = [];
for (const name of entries) {
	const bytes = await Bun.file(join(releaseDir, name)).arrayBuffer();
	const hash = createHash("sha256").update(Buffer.from(bytes)).digest("hex");
	lines.push(`${hash}  ${name}`);
}
await Bun.write(join(releaseDir, "SHA256SUMS"), `${lines.join("\n")}\n`);
console.log(`Wrote SHA256SUMS (${entries.length} assets)`);
console.log("All release targets compiled.");
