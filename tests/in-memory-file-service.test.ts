import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { analyzeFiles } from "../src/analyzer";
import { fixFiles } from "../src/fixer";
import { nestedRule } from "../src/nested-rule";
import { Pipeline } from "../src/pipeline";
import { registerDefaultRules } from "../src/register-default-rules";
import { clear, createRegistry } from "../src/registry";
import { InMemoryFileService } from "../src/services/InMemoryFileService";
import { stepdownRule } from "../src/stepdown-rule";
import type { Config } from "../src/types";
import { defaultConfig } from "./helpers";

const STEPDOWN_VIOLATION = `function low() { return 1; }\nfunction high() { return low(); }\n`;
const PATH = "mem/sample.ts";

beforeEach(() => {
	clear();
});

afterEach(() => {
	clear();
	registerDefaultRules();
});

describe("InMemoryFileService", () => {
	test("resolveFiles matches exact path and glob; ignore excludes", async () => {
		const service = new InMemoryFileService(
			{
				"src/a.ts": "const a = 1;",
				"src/b.ts": "const b = 2;",
				"src/skip.ts": "const s = 3;",
			},
			{ ignore: ["**/skip.ts"] },
		);
		expect(await service.resolveFiles(["src/a.ts"])).toEqual(["src/a.ts"]);
		expect(await service.resolveFiles(["src/**/*.ts"])).toEqual(["src/a.ts", "src/b.ts"]);
	});

	test("read/write round-trip; missing path throws", async () => {
		const service = new InMemoryFileService({ "x.ts": "export {}" });
		await service.writeFile("x.ts", "export const n = 1;");
		expect(await service.readFile("x.ts")).toBe("export const n = 1;");
		await expect(service.readFile("missing.ts")).rejects.toThrow("ENOENT");
	});

	test("Pipeline analyze+fix on string source — no temp dir", async () => {
		const service = new InMemoryFileService({ [PATH]: STEPDOWN_VIOLATION });
		const registry = createRegistry();
		registry.register(stepdownRule);
		registry.register(nestedRule);
		const fixConfig: Config = { ...defaultConfig, fix: true };

		const analyzed = await Pipeline.run({
			patterns: [PATH],
			config: defaultConfig,
			fileService: service,
			registry,
			mode: "analyze",
		});
		expect(analyzed.analysisResults).toHaveLength(1);
		expect(analyzed.analysisResults[0]?.violations.length).toBeGreaterThan(0);
		expect(analyzed.fixResults).toEqual([]);

		const fixed = await Pipeline.run({
			patterns: [PATH],
			config: fixConfig,
			fileService: service,
			registry,
			mode: "fix",
		});
		expect(fixed.fixResults).toHaveLength(1);
		expect(fixed.fixResults[0]?.fixed).toBe(true);
		const afterContent = await service.readFile(PATH);
		expect(afterContent).not.toBe(STEPDOWN_VIOLATION);

		const reanalyzed = await Pipeline.run({
			patterns: [PATH],
			config: defaultConfig,
			fileService: service,
			registry,
			mode: "analyze",
		});
		expect(reanalyzed.analysisResults[0]?.violations).toEqual([]);
	});

	test("analyzeFiles + fixFiles facades accept IFileService", async () => {
		const service = new InMemoryFileService({ [PATH]: STEPDOWN_VIOLATION });
		const registry = createRegistry();
		registry.register(stepdownRule);
		registry.register(nestedRule);

		const results = await analyzeFiles([PATH], defaultConfig, service, undefined, registry);
		expect(results[0]?.violations.length).toBeGreaterThan(0);

		const fixes = await fixFiles(
			[PATH],
			{ ...defaultConfig, fix: true },
			service,
			{},
			registry,
		);
		expect(fixes[0]?.fixed).toBe(true);
		expect(await service.readFile(PATH)).not.toBe(STEPDOWN_VIOLATION);
	});
});
