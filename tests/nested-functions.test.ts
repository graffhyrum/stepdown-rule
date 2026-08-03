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

const noNestedFlagCases: Array<{ name: string; load: () => Promise<string> | string }> = [
	{
		name: "nested function after return",
		load: () => Bun.file("fixtures/test-nested-correct.ts").text(),
	},
	{
		name: "nested function referenced in return",
		load: () => `function parent() {
	function helper() { return "I help"; }
	return helper();
}`,
	},
	{
		name: "nested arrow when referenced",
		load: () => Bun.file("fixtures/test-nested-arrow.ts").text(),
	},
	{
		name: "multiple nested when referenced",
		load: () => Bun.file("fixtures/test-nested-multiple.ts").text(),
	},
	{
		name: "nested referenced in logic",
		load: () => Bun.file("fixtures/test-nested-no-return.ts").text(),
	},
];

for (const { name, load } of noNestedFlagCases) {
	test(`does not flag ${name}`, async () => {
		const code = await load();
		expect(analyzeCode(code).nestedFunctionViolations).toHaveLength(0);
	});
}

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

const convergeCases: Array<{
	name: string;
	load: () => Promise<string> | string;
	logicNeedle: string;
	helperNeedle: string;
}> = [
	{
		name: "lone nested FunctionDeclaration",
		load: () => Bun.file("fixtures/test-nested-lone-before-logic.ts").text(),
		logicNeedle: "console.log",
		helperNeedle: "function helper",
	},
	{
		name: "lone nested const-arrow",
		load: () => Bun.file("fixtures/test-nested-lone-arrow-before-logic.ts").text(),
		logicNeedle: "console.log",
		helperNeedle: "const helper",
	},
	{
		name: "ExpressionStatement-wrapped call",
		load: () => Bun.file("fixtures/test-nested-expr-stmt-before-logic.ts").text(),
		logicNeedle: "console.log",
		helperNeedle: "function helper",
	},
	{
		name: "VariableStatement-wrapped call",
		load: () => `const run = (name: string, fn: () => void) => fn();
const suite = run("suite", () => {
  function helper() { return 42; }
  console.log("logic");
});`,
		logicNeedle: "console.log",
		helperNeedle: "function helper",
	},
];

for (const { name, load, logicNeedle, helperNeedle } of convergeCases) {
	test(`5x2.7: ${name} converges in one pass`, async () => {
		const code = await load();
		const before = analyzeCode(code);
		expect(before.nestedFunctionViolations.length).toBeGreaterThan(0);
		const { after, fixedContent } = fixCode(code);
		expect(totalViolations(after)).toBe(0);
		expect(fixedContent.indexOf(logicNeedle)).toBeLessThan(fixedContent.indexOf(helperNeedle));
	});
}
