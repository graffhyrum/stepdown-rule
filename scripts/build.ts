import { FileConfigJsonSchema } from "../src/config/schema";

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
