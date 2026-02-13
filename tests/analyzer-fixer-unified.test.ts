import { expect, test } from "bun:test";
import ts from "typescript";
import { analyzeFiles, analyzeParsedFile } from "../src/analyzer";
import { fixFiles, fixParsedFile } from "../src/fixer";
import { cleanupTempDir, createTempDir, createTestFile, fixConfig } from "./helpers";

/**
 * hje: Fixer must use analyzer's dependency graph.
 * fixParsedFile with analysisResult uses same view as analyzer.
 */
test("hje: fixParsedFile uses analyzer dependency graph when provided", () => {
	const content = `
function helper() {
	return "helper result";
}

function main() {
	return helper();
}
`;
	const sourceFile = ts.createSourceFile("test.ts", content, ts.ScriptTarget.Latest, true);
	const parsedFile = { sourceFile, filePath: "test.ts", content };
	const analysis = analyzeParsedFile(parsedFile);

	expect(analysis.violations.length).toBeGreaterThan(0);
	expect(analysis.dependencyGraph?.get("main")).toContain("helper");

	const result = fixParsedFile({
		content,
		filePath: "test.ts",
		config: fixConfig,
		analysisResult: analysis,
	});

	expect(result.fixed).toBe(true);
	expect(result.fixedContent.indexOf("function main")).toBeLessThan(
		result.fixedContent.indexOf("function helper"),
	);
});

test("hje: analyze→fix→analyze converges", async () => {
	const content = `
const callee = () => "leaf";
const caller = () => callee();
`;
	const dir = createTempDir("hje-temp");
	try {
		const file = await createTestFile(dir, "converge.ts", content);

		const [before] = await analyzeFiles([file], fixConfig);
		const violationsBefore =
			(before?.violations.length ?? 0) + (before?.nestedFunctionViolations.length ?? 0);

		await fixFiles([file], fixConfig);

		const [after] = await analyzeFiles([file], fixConfig);
		const violationsAfter =
			(after?.violations.length ?? 0) + (after?.nestedFunctionViolations.length ?? 0);

		expect(violationsAfter).toBeLessThanOrEqual(violationsBefore);
		expect(violationsAfter).toBe(0);
	} finally {
		cleanupTempDir(dir);
	}
});

/**
 * Rule: anything the analyzer detects must be fixable by the fixer.
 * Callee-defined-first with multiple callers (e.g. createUnfixedResult pattern).
 */
test("stepdown: callee-first with multiple callers → fix → 0 violations", async () => {
	const content = `function sharedHelper() { return "ok"; }
function callerA() { return sharedHelper(); }
function callerB() { return sharedHelper(); }
function callerC() { return sharedHelper(); }
`;
	const dir = createTempDir("stepdown-fix-temp");
	try {
		const file = await createTestFile(dir, "stepdown.ts", content);
		const [before] = await analyzeFiles([file], fixConfig);
		const stepdownBefore = before?.violations.length ?? 0;
		expect(stepdownBefore).toBeGreaterThan(0);

		const [fixResult] = await fixFiles([file], fixConfig);
		expect(fixResult?.fixed).toBe(true);
		expect(fixResult?.errors).toHaveLength(0);

		const [after] = await analyzeFiles([file], fixConfig);
		const stepdownAfter = after?.violations.length ?? 0;
		expect(stepdownAfter).toBe(0);
	} finally {
		cleanupTempDir(dir);
	}
});
