import { beforeAll, expect, test } from "bun:test";
import { analyzeFiles } from "../src/analyzer";
import { registerDefaultRules } from "../src/register-default-rules";
import { clear } from "../src/registry";
import { analyzeCode, defaultConfig, fixCode, totalViolations } from "./helpers";

beforeAll(() => {
	clear();
	registerDefaultRules();
});

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

test("does not flag nested function when referenced in return", () => {
	const code = `function parent() {
	function helper() { return "I help"; }
	return helper();
}`;
	expect(analyzeCode(code).nestedFunctionViolations.length).toBe(0);
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

test("db8/aka: functions inside .derive() callback are scoped (no false top-level violations)", () => {
	const code = `
const sessionPlugin = { derive: (fn: () => unknown) => fn() }.derive(() => {
  const getSessionId = () => "id";
  const ensureSessionCookie = () => getSessionId();
  return { getSessionId, ensureSessionCookie };
});
`;
	expect(analyzeCode(code).violations.length).toBe(0);
});

test("5x2.7: lone nested-before-logic FunctionDeclaration converges in one pass", async () => {
	const code = await Bun.file("fixtures/test-nested-lone-before-logic.ts").text();
	const before = analyzeCode(code);
	expect(before.nestedFunctionViolations.length).toBeGreaterThan(0);
	const { after, fixedContent } = fixCode(code);
	expect(totalViolations(after)).toBe(0);
	expect(fixedContent.indexOf("console.log")).toBeLessThan(fixedContent.indexOf("function helper"));
});

test("5x2.7: lone nested-before-logic const-arrow converges in one pass", async () => {
	const code = await Bun.file("fixtures/test-nested-lone-arrow-before-logic.ts").text();
	const before = analyzeCode(code);
	expect(before.nestedFunctionViolations.length).toBeGreaterThan(0);
	const { after, fixedContent } = fixCode(code);
	expect(totalViolations(after)).toBe(0);
	expect(fixedContent.indexOf("console.log")).toBeLessThan(fixedContent.indexOf("const helper"));
});

test("5x2.7: ExpressionStatement-wrapped call nested-before-logic converges", async () => {
	const code = await Bun.file("fixtures/test-nested-expr-stmt-before-logic.ts").text();
	const before = analyzeCode(code);
	expect(before.nestedFunctionViolations.length).toBeGreaterThan(0);
	const { after, fixedContent } = fixCode(code);
	expect(totalViolations(after)).toBe(0);
	expect(fixedContent.indexOf("console.log")).toBeLessThan(fixedContent.indexOf("function helper"));
});

test("5x2.7: VariableStatement-wrapped call nested-before-logic converges", () => {
	const code = `const run = (name: string, fn: () => void) => fn();
const suite = run("suite", () => {
  function helper() { return 42; }
  console.log("logic");
});`;
	const before = analyzeCode(code);
	expect(before.nestedFunctionViolations.length).toBeGreaterThan(0);
	const { after, fixedContent } = fixCode(code);
	expect(totalViolations(after)).toBe(0);
	expect(fixedContent.indexOf("console.log")).toBeLessThan(fixedContent.indexOf("function helper"));
});
