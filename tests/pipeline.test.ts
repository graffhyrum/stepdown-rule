import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { nestedRule } from "../src/nested-rule";
import { Pipeline } from "../src/pipeline";
import { registerDefaultRules } from "../src/register-default-rules";
import { clear, createRegistry } from "../src/registry";
import type { ViolationRule } from "../src/rule-context";
import { FileService } from "../src/services/FileService";
import { stepdownRule } from "../src/stepdown-rule";
import type { Config } from "../src/types";
import { cleanupTempDir, createTempDir, createTestFile, defaultConfig } from "./helpers";

beforeEach(() => {
	clear();
});

afterEach(() => {
	clear();
	registerDefaultRules();
});

class TrackingFileService extends FileService {
	readonly stages: string[] = [];

	override async resolveFiles(patterns: string[]): Promise<string[]> {
		this.stages.push("Resolved");
		return super.resolveFiles(patterns);
	}

	override async parseFile(filePath: string) {
		this.stages.push("Parsed");
		return super.parseFile(filePath);
	}

	override async writeFile(filePath: string, content: string): Promise<void> {
		this.stages.push("Fixed");
		return super.writeFile(filePath, content);
	}
}

function trackingRule(id: string, stages: string[]): ViolationRule {
	return {
		id,
		analyze: () => {
			stages.push("Analyzed");
			return [];
		},
		fix: (ctx) => ctx.parsedFile.content,
	};
}

describe("Pipeline.run", () => {
	test("analyze mode: Resolved→Parsed→Analyzed via FileService + registry", async () => {
		const dir = createTempDir("pipeline-stub-analyze");
		try {
			const file = await createTestFile(
				dir,
				"sample.ts",
				`function low() { return 1; }\nfunction high() { return low(); }\n`,
			);
			const stages: string[] = [];
			const fileService = new TrackingFileService();
			const registry = createRegistry();
			registry.register(trackingRule("probe", stages));

			const result = await Pipeline.run({
				patterns: [file],
				config: defaultConfig,
				fileService,
				registry,
				mode: "analyze",
			});

			expect([...fileService.stages, ...stages]).toEqual(["Resolved", "Parsed", "Analyzed"]);
			expect(result.analysisResults).toHaveLength(1);
			expect(result.analysisResults[0]?.file).toBe(file.replaceAll("\\", "/"));
			expect(result.fixResults).toEqual([]);
		} finally {
			cleanupTempDir(dir);
		}
	});

	test("analyze mode: uses injected registry, not default", async () => {
		const dir = createTempDir("pipeline-stub-registry");
		try {
			const file = await createTestFile(
				dir,
				"sample.ts",
				`function low() { return 1; }\nfunction high() { return low(); }\n`,
			);
			registerDefaultRules();
			const registry = createRegistry();
			registry.register(stepdownRule);
			const fileService = new FileService();

			const withStepdown = await Pipeline.run({
				patterns: [file],
				config: defaultConfig,
				fileService,
				registry,
				mode: "analyze",
			});
			expect(withStepdown.analysisResults[0]?.violations.length).toBeGreaterThan(0);

			const emptyRegistry = createRegistry();
			const withoutRules = await Pipeline.run({
				patterns: [file],
				config: defaultConfig,
				fileService,
				registry: emptyRegistry,
				mode: "analyze",
			});
			expect(withoutRules.analysisResults[0]?.violations).toEqual([]);
			expect(withoutRules.analysisResults[0]?.nestedFunctionViolations).toEqual([]);
		} finally {
			cleanupTempDir(dir);
		}
	});

	test("fix mode: Resolved→Parsed→Analyzed→Fixed dryRun skips write", async () => {
		const dir = createTempDir("pipeline-body-fix");
		try {
			const original = `function low() { return 1; }\nfunction high() { return low(); }\n`;
			const file = await createTestFile(dir, "sample.ts", original);
			const analyzed: string[] = [];
			const fileService = new TrackingFileService();
			const registry = createRegistry();
			registry.register(trackingRule("probe", analyzed));
			registry.register(stepdownRule);
			registry.register(nestedRule);
			const config: Config = { ...defaultConfig, fix: true };

			const result = await Pipeline.run({
				patterns: [file],
				config,
				fileService,
				registry,
				mode: "fix",
				dryRun: true,
			});

			expect(fileService.stages).toEqual(["Resolved", "Parsed"]);
			expect(analyzed.length).toBeGreaterThan(0);
			expect(result.analysisResults).toHaveLength(1);
			expect(result.fixResults).toHaveLength(1);
			expect(result.fixResults[0]?.fixed).toBe(true);
			expect(await Bun.file(file).text()).toBe(original);
		} finally {
			cleanupTempDir(dir);
		}
	});

	test("fix mode: write path records Fixed", async () => {
		const dir = createTempDir("pipeline-body-fix-write");
		try {
			const original = `function low() { return 1; }\nfunction high() { return low(); }\n`;
			const file = await createTestFile(dir, "sample.ts", original);
			const fileService = new TrackingFileService();
			const registry = createRegistry();
			registry.register(stepdownRule);
			registry.register(nestedRule);
			const config: Config = { ...defaultConfig, fix: true };

			const result = await Pipeline.run({
				patterns: [file],
				config,
				fileService,
				registry,
				mode: "fix",
				dryRun: false,
			});

			expect(fileService.stages).toEqual(["Resolved", "Parsed", "Fixed"]);
			expect(result.fixResults[0]?.fixed).toBe(true);
			expect(await Bun.file(file).text()).not.toBe(original);
		} finally {
			cleanupTempDir(dir);
		}
	});
});
