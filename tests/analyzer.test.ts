import { expect, test } from "bun:test";
import { analyzeFiles } from "../src/analyzer";
import { analyzeCode, defaultConfig } from "./helpers";

// --- Core behavior ---

test("detects stepdown violations", async () => {
	const results = await analyzeFiles(["fixtures/test-violations.ts"], defaultConfig);

	expect(results).toHaveLength(1);
	const [result] = results;
	expect(result).toBeDefined();
	expect(result?.violations).toHaveLength(4);

	const pairs = (result?.violations ?? []).map((v) => ({
		caller: v.function.name,
		dependency: v.dependency.name,
	}));
	expect(pairs).toContainEqual({ caller: "_main", dependency: "createUser" });
	expect(pairs).toContainEqual({ caller: "_main", dependency: "validateEmail" });
	expect(pairs).toContainEqual({ caller: "createUser", dependency: "hashPassword" });
	expect(pairs).toContainEqual({ caller: "_processData", dependency: "cleanData" });
});

test("reports no violations when code is properly ordered", async () => {
	const results = await analyzeFiles(["fixtures/test-correct.ts"], defaultConfig);

	expect(results).toHaveLength(1);
	expect(results[0]?.violations).toHaveLength(0);
});

test("detects circular dependencies", async () => {
	const results = await analyzeFiles(["fixtures/test-circular.ts"], defaultConfig);

	expect(results).toHaveLength(1);
	expect(results[0]?.circularDependencies.length).toBeGreaterThan(0);
});

// --- Edge cases: variable declarations ---

test("skips destructured variable declarations without simple identifier", () => {
	const result = analyzeCode(`const { prop } = { prop: () => "test" };`);
	expect(result.totalFunctions).toBe(0);
});

test("skips declarations without initializer", () => {
	const result = analyzeCode(`let myFunc: () => void;\nmyFunc = () => console.log("test");`);
	expect(result.totalFunctions).toBe(0);
});

test("skips array destructuring", () => {
	const result = analyzeCode(`const [first, second] = [() => "a", () => "b"];`);
	expect(result.totalFunctions).toBe(0);
});

test("counts only functions in mixed variable declarations", () => {
	const result = analyzeCode(
		`const notAFunction = 42;
const thisIsAFunction = () => "function";
function main() { return thisIsAFunction(); }`,
	);
	expect(result.totalFunctions).toBe(2);
});

test("counts exported and non-exported functions consistently", () => {
	const result = analyzeCode(
		`export const exportedFunc = () => "exported";
const nonExportedFunc = () => "not exported";
export function exportedDecl() { return "decl"; }
function nonExportedDecl() { return "not exported"; }`,
	);
	expect(result.totalFunctions).toBe(4);
});

// --- Edge cases: call graph ---

test("handles arrow functions in call graph", () => {
	const result = analyzeCode(
		`const arrowA = () => arrowB();
const arrowB = () => "B";
function main() { return arrowA(); }`,
	);
	expect(result.violations.length).toBeGreaterThan(0);
});

test("handles function expressions", () => {
	const result = analyzeCode(
		`const funcExpr = function() { return helper(); };
function helper() { return "helper"; }
function main() { return funcExpr(); }`,
	);
	expect(result.totalFunctions).toBeGreaterThan(0);
});

test("handles shared dependency (multiple callers)", () => {
	const result = analyzeCode(
		`function d() { return 42; }
function c() { return d(); }
function b() { return d(); }
function a() { return b() + c(); }`,
	);
	expect(result.totalFunctions).toBe(4);
	expect(result.violations.length).toBeGreaterThan(0);
});

test("handles standalone functions with no dependencies", () => {
	const result = analyzeCode(
		`function a() { return 1; }
function b() { return 2; }
function c() { return 3; }`,
	);
	expect(result.totalFunctions).toBe(3);
	expect(result.violations).toHaveLength(0);
});

// --- Edge cases: empty / malformed ---

test("handles empty files", () => {
	const result = analyzeCode("");
	expect(result.totalFunctions).toBe(0);
	expect(result.violations).toHaveLength(0);
});

test("handles files with only comments", () => {
	const result = analyzeCode("// comment\n/* block */");
	expect(result.totalFunctions).toBe(0);
});

test("arrow parent with referenced nested function has no false-positive nested violation", () => {
	const result = analyzeCode(`const parent = () => {
  const x = helper();
  return x;
  function helper() { return 42; }
};`);
	expect(result.nestedFunctionViolations).toHaveLength(0);
});
