import { mkdir } from "node:fs/promises";
import {
	AgentsAnalyzeEnvelopeJsonSchema,
	AgentsFixEnvelopeJsonSchema,
	FileConfigJsonSchema,
} from "../src/config/schema";
import { compileNativeCli, isReleaseCompileTarget, releaseOutfile } from "./compile-native";

export async function emitSchemasAndBundles(): Promise<void> {
	await emitJsBundles();
	await Promise.all([copyConfigSources(), writeJsonSchemas()]);
}

async function emitJsBundles(): Promise<void> {
	await Bun.build({
		entrypoints: ["src/index.ts", "src/cli.ts"],
		outdir: "./dist",
		format: "esm",
		target: "node",
	});
}

async function copyConfigSources(): Promise<void> {
	const [schemaText, loaderText] = await Promise.all([
		Bun.file("./src/config/schema.ts").text(),
		Bun.file("./src/config/loader.ts").text(),
	]);
	await Promise.all([
		Bun.write("./dist/config/schema.js", schemaText),
		Bun.write("./dist/config/loader.js", loaderText),
	]);
}

async function writeJsonSchemas(): Promise<void> {
	await Promise.all([
		Bun.write("./dist/stepdown-schema.json", JSON.stringify(FileConfigJsonSchema, null, 2)),
		Bun.write("./stepdown-schema.json", JSON.stringify(FileConfigJsonSchema, null, 2)),
		Bun.write(
			"./dist/agents-analyze-schema.json",
			JSON.stringify(AgentsAnalyzeEnvelopeJsonSchema, null, 2),
		),
		Bun.write(
			"./dist/agents-fix-schema.json",
			JSON.stringify(AgentsFixEnvelopeJsonSchema, null, 2),
		),
	]);
}

function parseArgs(argv: string[]): { compileOnly: boolean; target: string | undefined } {
	let compileOnly = false;
	let target: string | undefined;
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === "--compile-only") {
			compileOnly = true;
		} else if (arg === "--target" && argv[i + 1]) {
			target = argv[++i];
		} else if (arg?.startsWith("--target=")) {
			target = arg.slice("--target=".length);
		}
	}
	return {
		compileOnly,
		target: target ?? process.env.STEPDOWN_COMPILE_TARGET,
	};
}

const { compileOnly, target } = parseArgs(process.argv.slice(2));

if (!compileOnly) {
	await emitSchemasAndBundles();
}

if (target) {
	if (!isReleaseCompileTarget(target)) {
		throw new Error(`Unknown compile target: ${target}`);
	}
	await mkdir("dist/release", { recursive: true });
	const compiled = await compileNativeCli({ target, outfile: releaseOutfile(target) });
	console.log(`Compiled ${compiled}`);
} else {
	const compiled = await compileNativeCli({ outfile: "./dist/stepdown-rule" });
	console.log(`Compiled ${compiled}`);
}
