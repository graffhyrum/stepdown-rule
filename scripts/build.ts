await Bun.build({
	entrypoints: ["src/index.ts", "src/cli.ts"],
	outdir: "./dist",
	format: "esm",
	target: "node",
});

export {};
