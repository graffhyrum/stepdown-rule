import { beforeAll, expect, test } from "bun:test";
import { analyzeFiles } from "../src/analyzer";
import { fixFileWithRules, fixFiles } from "../src/fixer";
import { registerDefaultRules } from "../src/register-default-rules";
import { clear, getEnabled } from "../src/registry";
import { InMemoryFileService } from "../src/services/InMemoryFileService";
import { analyzeCode, fixCode, fixConfig, totalViolations, withTempFile } from "./helpers";

beforeAll(() => {
	clear();
	registerDefaultRules();
});

/** Rule-based fix reorders caller above callee. */
test("fixFileWithRules reorders caller above callee", () => {
	const content = `
function helper() {
	return "helper result";
}

function main() {
	return helper();
}
`;
	const result = fixFileWithRules({
		filePath: "test.ts",
		originalContent: content,
		enabledRules: getEnabled(),
		service: new InMemoryFileService(),
	});

	expect(result.fixed).toBe(true);
	expect(result.fixedContent.indexOf("function main")).toBeLessThan(
		result.fixedContent.indexOf("function helper"),
	);
});

test("hje: analyze→fix→analyze converges", () => {
	const content = `
const callee = () => "leaf";
const caller = () => callee();
`;
	const { after } = fixCode(content);
	expect(totalViolations(after)).toBe(0);
});

/**
 * Rule: anything the analyzer detects must be fixable by the fixer.
 * Callee-defined-first with multiple callers (e.g. createUnfixedResult pattern).
 */
test("stepdown: callee-first with multiple callers → fix → 0 violations", () => {
	const content = `function sharedHelper() { return "ok"; }
function callerA() { return sharedHelper(); }
function callerB() { return sharedHelper(); }
function callerC() { return sharedHelper(); }
`;
	const before = totalViolations(analyzeCode(content));
	expect(before).toBeGreaterThan(0);

	const { result, after } = fixCode(content);
	expect(result.fixed).toBe(true);
	expect(result.errors).toHaveLength(0);
	expect(after.violations.length).toBe(0);
});

test("integration: analyze→fixFiles→analyze on disk converges", async () => {
	const content = `
const callee = () => "leaf";
const caller = () => callee();
`;
	await withTempFile(content, async (file) => {
		const [before] = await analyzeFiles([file], fixConfig);
		const violationsBefore = totalViolations(before);
		await fixFiles({ patterns: [file], config: fixConfig });
		const [after] = await analyzeFiles([file], fixConfig);
		expect(totalViolations(after)).toBeLessThanOrEqual(violationsBefore);
		expect(totalViolations(after)).toBe(0);
	});
});
