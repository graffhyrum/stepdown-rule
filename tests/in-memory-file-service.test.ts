import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { analyzeFiles } from "../src/analyzer";
import { fixFiles } from "../src/fixer";
import { Pipeline } from "../src/pipeline";
import { registerDefaultRules } from "../src/register-default-rules";
import { clear } from "../src/registry";
import { InMemoryFileService } from "../src/services/InMemoryFileService";
import {
	defaultConfig,
	defaultRulesRegistry,
	MEM_PATH,
	MEM_STEPDOWN,
} from "./helpers";

beforeEach(() => {
	clear();
});

afterEach(() => {
	clear();
	registerDefaultRules();
});

describe("InMemoryFileService", () => {
	test("resolveFiles matches exact path", async () => {
		const service = new InMemoryFileService({ "src/a.ts": "const a = 1;" });
		expect(await service.resolveFiles(["src/a.ts"])).toEqual(["src/a.ts"]);
	});

	test("resolveFiles matches glob and applies ignore", async () => {
		const service = new InMemoryFileService(
			{
				"src/a.ts": "const a = 1;",
				"src/b.ts": "const b = 2;",
				"src/skip.ts": "const s = 3;",
			},
			{ ignore: ["**/skip.ts"] },
		);
		expect(await service.resolveFiles(["src/**/*.ts"])).toEqual(["src/a.ts", "src/b.ts"]);
	});

	test("read/write round-trip", async () => {
		const service = new InMemoryFileService({ "x.ts": "export {}" });
		await service.writeFile("x.ts", "export const n = 1;");
		expect(await service.readFile("x.ts")).toBe("export const n = 1;");
	});

	test("read missing path throws ENOENT", () => {
		const service = new InMemoryFileService({ "x.ts": "export {}" });
		// Bun types toThrow as void (not Promise); runner still tracks the rejection.
		expect(service.readFile("missing.ts")).rejects.toThrow("ENOENT");
	});

	test("Pipeline analyze+fix on string source — no temp dir", async () => {
		const service = new InMemoryFileService({ [MEM_PATH]: MEM_STEPDOWN });
		const registry = defaultRulesRegistry();

		const analyzed = await Pipeline.run({
			patterns: [MEM_PATH],
			config: defaultConfig,
			fileService: service,
			registry,
			mode: "analyze",
		});
		expect(analyzed.analysisResults).toHaveLength(1);
		expect(analyzed.analysisResults[0]?.violations.length).toBeGreaterThan(0);
		expect(analyzed.fixResults).toEqual([]);

		const fixed = await Pipeline.run({
			patterns: [MEM_PATH],
			config: defaultConfig,
			fileService: service,
			registry,
			mode: "fix",
		});
		expect(fixed.fixResults).toHaveLength(1);
		expect(fixed.fixResults[0]?.fixed).toBe(true);
		const afterContent = await service.readFile(MEM_PATH);
		expect(afterContent).not.toBe(MEM_STEPDOWN);

		const reanalyzed = await Pipeline.run({
			patterns: [MEM_PATH],
			config: defaultConfig,
			fileService: service,
			registry,
			mode: "analyze",
		});
		expect(reanalyzed.analysisResults[0]?.violations).toEqual([]);
	});

	test("analyzeFiles + fixFiles facades accept IFileService", async () => {
		const service = new InMemoryFileService({ [MEM_PATH]: MEM_STEPDOWN });
		const registry = defaultRulesRegistry();

		const results = await analyzeFiles([MEM_PATH], defaultConfig, service, undefined, registry);
		expect(results[0]?.violations.length).toBeGreaterThan(0);

		const fixes = await fixFiles({
			patterns: [MEM_PATH],
			config: defaultConfig,
			fileService: service,
			registry,
		});
		expect(fixes[0]?.fixed).toBe(true);
		expect(await service.readFile(MEM_PATH)).not.toBe(MEM_STEPDOWN);
	});
});
