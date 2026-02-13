import { expect, test } from "bun:test";
import { analyzeFiles } from "../src/analyzer";
import { fixFiles } from "../src/fixer";
import { cleanupTempDir, createTempDir, createTestFile, defaultConfig, fixConfig } from "./helpers";

test("detects nested function before logic when not referenced", async () => {
	const results = await analyzeFiles(["fixtures/test-nested-violation.ts"], defaultConfig);
	const [result] = results;
	expect(result).toBeDefined();
	expect(result?.nestedFunctionViolations.length).toBeGreaterThan(0);
	const v = result?.nestedFunctionViolations[0];
	expect(v).toBeDefined();
	if (v) {
		expect(v.nested.name).toBe("helper");
		expect(v.parent.name).toBe("parent");
	}
	expect(v?.message).toContain("should appear after all logic");
});

test("does not flag nested function after return", async () => {
	const results = await analyzeFiles(["fixtures/test-nested-correct.ts"], defaultConfig);
	expect(results[0]?.nestedFunctionViolations.length).toBe(0);
});

test("does not flag nested function when referenced in return", async () => {
	const dir = createTempDir("nested-temp");
	try {
		const file = await createTestFile(
			dir,
			"test.ts",
			`function parent() {
	function helper() { return "I help"; }
	return helper();
}`,
		);
		const [result] = await analyzeFiles([file], defaultConfig);
		expect(result?.nestedFunctionViolations.length).toBe(0);
	} finally {
		cleanupTempDir(dir);
	}
});

test("does not flag nested arrow when referenced", async () => {
	const results = await analyzeFiles(["fixtures/test-nested-arrow.ts"], defaultConfig);
	expect(results[0]?.nestedFunctionViolations.length).toBe(0);
});

test("does not flag multiple nested when referenced", async () => {
	const results = await analyzeFiles(["fixtures/test-nested-multiple.ts"], defaultConfig);
	expect(results[0]?.nestedFunctionViolations.length).toBe(0);
});

test("does not flag nested when referenced in logic", async () => {
	const results = await analyzeFiles(["fixtures/test-nested-no-return.ts"], defaultConfig);
	expect(results[0]?.nestedFunctionViolations.length).toBe(0);
});

test("db8/aka: detects and fixes stepdown in .derive() callback", async () => {
	const dir = createTempDir("nested-temp");
	try {
		const code = `
const sessionPlugin = { derive: (fn: () => unknown) => fn() }.derive(() => {
  const getSessionId = () => "id";
  const ensureSessionCookie = () => getSessionId();
  return { getSessionId, ensureSessionCookie };
});
`;
		const file = await createTestFile(dir, "test.ts", code);

		const [before] = await analyzeFiles([file], defaultConfig);
		expect(before?.violations.length).toBeGreaterThan(0);
		expect(before?.violations.some((v) => v.dependency.name === "getSessionId")).toBe(true);

		await fixFiles([file], fixConfig);

		const [after] = await analyzeFiles([file], defaultConfig);
		expect(after?.violations.length).toBe(0);
	} finally {
		cleanupTempDir(dir);
	}
});
