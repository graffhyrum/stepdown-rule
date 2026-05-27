import {
	AgentsAnalyzeEnvelopeJsonSchema,
	AgentsFixEnvelopeJsonSchema,
	FileConfigJsonSchema,
} from "../src/config/schema";

await Bun.build({
	entrypoints: ["src/index.ts", "src/cli.ts"],
	outdir: "./dist",
	format: "esm",
	target: "node",
});

// Copy schema files to dist
await Bun.write("./dist/config/schema.js", await Bun.file("./src/config/schema.ts").text());
await Bun.write("./dist/config/loader.js", await Bun.file("./src/config/loader.ts").text());

// Use generated JSON schemas from ArkType
await Bun.write("./dist/stepdown-schema.json", JSON.stringify(FileConfigJsonSchema, null, 2));
await Bun.write("./stepdown-schema.json", JSON.stringify(FileConfigJsonSchema, null, 2));
await Bun.write(
	"./dist/agents-analyze-schema.json",
	JSON.stringify(AgentsAnalyzeEnvelopeJsonSchema, null, 2),
);
await Bun.write(
	"./dist/agents-fix-schema.json",
	JSON.stringify(AgentsFixEnvelopeJsonSchema, null, 2),
);

// Produce self-contained native executable for durable CLI distribution.
// This binary embeds the Bun runtime + all deps, eliminating the need for
// "#!/usr/bin/env bun" resolution and making the tool easily symlinked into
// any PATH (~/bin, /usr/local/bin, etc.) for use across all projects.
const compile = Bun.$`bun build --compile src/cli.ts --outfile ./dist/stepdown-rule`;
const compileResult = await compile;
if (compileResult.exitCode !== 0) {
	console.error("Failed to compile native CLI binary");
	process.exit(1);
}
