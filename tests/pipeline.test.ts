import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Pipeline } from "../src/pipeline";
import { registerDefaultRules } from "../src/register-default-rules";
import { clear, createRegistry } from "../src/registry";
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

describe("Pipeline.run", () => {
	test("analyze mode returns violations for stepdown fixture", async () => {
		const service = new InMemoryFileService({ [MEM_PATH]: MEM_STEPDOWN });
		const result = await Pipeline.run({
			patterns: [MEM_PATH],
			config: defaultConfig,
			fileService: service,
			registry: defaultRulesRegistry(),
			mode: "analyze",
		});
		expect(result.analysisResults).toHaveLength(1);
		expect(result.analysisResults[0]?.file).toBe(MEM_PATH);
		expect(result.analysisResults[0]?.violations.length).toBeGreaterThan(0);
		expect(result.fixResults).toEqual([]);
	});

	test("analyze mode uses injected registry, not default", async () => {
		const service = new InMemoryFileService({ [MEM_PATH]: MEM_STEPDOWN });
		registerDefaultRules();
		const withStepdown = await Pipeline.run({
			patterns: [MEM_PATH],
			config: defaultConfig,
			fileService: service,
			registry: defaultRulesRegistry(),
			mode: "analyze",
		});
		expect(withStepdown.analysisResults[0]?.violations.length).toBeGreaterThan(0);

		const withoutRules = await Pipeline.run({
			patterns: [MEM_PATH],
			config: defaultConfig,
			fileService: service,
			registry: createRegistry(),
			mode: "analyze",
		});
		expect(withoutRules.analysisResults[0]?.violations).toEqual([]);
		expect(withoutRules.analysisResults[0]?.nestedFunctionViolations).toEqual([]);
	});

	test("fix mode dryRun reorders without writing", async () => {
		const service = new InMemoryFileService({ [MEM_PATH]: MEM_STEPDOWN });
		const result = await Pipeline.run({
			patterns: [MEM_PATH],
			config: defaultConfig,
			fileService: service,
			registry: defaultRulesRegistry(),
			mode: "fix",
			dryRun: true,
		});
		expect(result.analysisResults).toHaveLength(1);
		expect(result.fixResults).toHaveLength(1);
		expect(result.fixResults[0]?.fixed).toBe(true);
		expect(await service.readFile(MEM_PATH)).toBe(MEM_STEPDOWN);
	});

	test("fix mode writes reordered content", async () => {
		const service = new InMemoryFileService({ [MEM_PATH]: MEM_STEPDOWN });
		const result = await Pipeline.run({
			patterns: [MEM_PATH],
			config: defaultConfig,
			fileService: service,
			registry: defaultRulesRegistry(),
			mode: "fix",
			dryRun: false,
		});
		expect(result.fixResults[0]?.fixed).toBe(true);
		const after = await service.readFile(MEM_PATH);
		expect(after).not.toBe(MEM_STEPDOWN);
		expect(after.indexOf("function high")).toBeLessThan(after.indexOf("function low"));
	});

	test("fix mode records errors when write fails", async () => {
		const service = new InMemoryFileService({ [MEM_PATH]: MEM_STEPDOWN });
		service.writeFile = async () => {
			throw new Error("simulated write failure");
		};
		const result = await Pipeline.run({
			patterns: [MEM_PATH],
			config: defaultConfig,
			fileService: service,
			registry: defaultRulesRegistry(),
			mode: "fix",
		});
		expect(result.fixResults).toHaveLength(1);
		expect(result.fixResults[0]?.fixed).toBe(false);
		expect(result.fixResults[0]?.errors).toContain("simulated write failure");
		expect(result.fixResults[0]?.fixedContent).toBe(MEM_STEPDOWN);
		expect(await service.readFile(MEM_PATH)).toBe(MEM_STEPDOWN);
	});

	test("fix mode clean file is no-op without write", async () => {
		const clean = `function high() { return low(); }\nfunction low() { return 1; }\n`;
		const path = "mem/clean.ts";
		const service = new InMemoryFileService({ [path]: clean });
		let writes = 0;
		const originalWrite = service.writeFile.bind(service);
		service.writeFile = async (filePath, content) => {
			writes += 1;
			return originalWrite(filePath, content);
		};
		const result = await Pipeline.run({
			patterns: [path],
			config: defaultConfig,
			fileService: service,
			registry: defaultRulesRegistry(),
			mode: "fix",
		});
		expect(result.fixResults[0]?.fixed).toBe(false);
		expect(result.fixResults[0]?.fixedContent).toBe(clean);
		expect(writes).toBe(0);
	});

	test("fix mode empty registry does not reorder violations", async () => {
		const service = new InMemoryFileService({ [MEM_PATH]: MEM_STEPDOWN });
		const result = await Pipeline.run({
			patterns: [MEM_PATH],
			config: defaultConfig,
			fileService: service,
			registry: createRegistry(),
			mode: "fix",
		});
		expect(result.fixResults[0]?.fixed).toBe(false);
		expect(await service.readFile(MEM_PATH)).toBe(MEM_STEPDOWN);
	});

	test("multi-file analyze preserves resolve order", async () => {
		const service = new InMemoryFileService({
			"mem/a.ts": MEM_STEPDOWN,
			"mem/b.ts": `function high() { return low(); }\nfunction low() { return 1; }\n`,
		});
		const result = await Pipeline.run({
			patterns: ["mem/*.ts"],
			config: defaultConfig,
			fileService: service,
			registry: defaultRulesRegistry(),
			mode: "analyze",
		});
		expect(result.analysisResults.map((r) => r.file)).toEqual(["mem/a.ts", "mem/b.ts"]);
		expect(result.analysisResults[0]?.violations.length).toBeGreaterThan(0);
		expect(result.analysisResults[1]?.violations).toHaveLength(0);
	});
});
