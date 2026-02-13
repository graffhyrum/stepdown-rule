import { expect, test } from "bun:test";
import { analyzeParsedFile } from "../src/analyzer";
import { fixParsedFile } from "../src/fixer";
import { FileService } from "../src/services/FileService";
import type { Config } from "../src/types";

/**
 * hje: Fixer must use analyzer's dependency graph, not rebuild from scratch.
 * Ensures analyzer and fixer share the same view of function dependencies.
 */
const defaultConfig: Config = {
	ignore: [],
	analyzeArrowFunctions: true,
	analyzeExportsOnly: false,
	reportCircularDependencies: true,
	fix: true,
	json: false,
};

test("hje: fixParsedFile with analysis result uses analyzer's dependency graph", () => {
	const content = `
function helper() {
	return "helper result";
}

function main() {
	return helper();
}
`;

	const filePath = "test-hje.ts";
	const service = new FileService({ ignore: [] });
	const parsedFile = service.parseContent(content, filePath);
	const analysis = analyzeParsedFile(parsedFile);

	expect(analysis.violations.length).toBeGreaterThan(0);
	expect(analysis.dependencyGraph).toBeDefined();
	expect(analysis.dependencyGraph?.get("main")).toContain("helper");

	const result = fixParsedFile({
		content,
		filePath,
		config: defaultConfig,
		analysisResult: analysis,
	});

	expect(result.fixed).toBe(true);
	expect(result.fixedContent.indexOf("function main")).toBeLessThan(
		result.fixedContent.indexOf("function helper"),
	);
});

test("hje: fixFiles passes analysis to fix logic - analyze→fix→analyze converges", async () => {
	const content = `
const callee = () => "leaf";
const caller = () => callee();
`;

	const { fixFiles } = await import("../src/fixer");
	const { analyzeFiles } = await import("../src/analyzer");
	const { mkdirSync, rmSync, writeFileSync } = await import("node:fs");
	const { join } = await import("node:path");

	const TEST_DIR = join(process.cwd(), "tests", "fixtures-temp-hje");
	rmSync(TEST_DIR, { recursive: true, force: true });
	mkdirSync(TEST_DIR, { recursive: true });

	const filePath = join(TEST_DIR, "converge.ts");
	writeFileSync(filePath, content, "utf-8");

	const [before] = await analyzeFiles([filePath], defaultConfig);
	const violationsBefore =
		(before?.violations.length ?? 0) + (before?.nestedFunctionViolations.length ?? 0);

	await fixFiles([filePath], defaultConfig);

	const [after] = await analyzeFiles([filePath], defaultConfig);
	const violationsAfter =
		(after?.violations.length ?? 0) + (after?.nestedFunctionViolations.length ?? 0);

	expect(violationsAfter).toBeLessThanOrEqual(violationsBefore);
	expect(violationsAfter).toBe(0);

	rmSync(TEST_DIR, { recursive: true, force: true });
});
