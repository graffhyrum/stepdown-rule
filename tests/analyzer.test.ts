import { expect, test } from "bun:test";
import { analyzeFiles } from "../src/analyzer";
import { defaultConfig, withTempFile } from "./helpers";

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

test("skips destructured variable declarations without simple identifier", async () => {
	await withTempFile(`const { prop } = { prop: () => "test" };`, async (file) => {
		const [result] = await analyzeFiles([file], defaultConfig);
		expect(result?.totalFunctions).toBe(0);
	});
});

test("skips declarations without initializer", async () => {
	await withTempFile(`let myFunc: () => void;\nmyFunc = () => console.log("test");`, async (file) => {
		const [result] = await analyzeFiles([file], defaultConfig);
		expect(result?.totalFunctions).toBe(0);
	});
});

test("skips array destructuring", async () => {
	await withTempFile(`const [first, second] = [() => "a", () => "b"];`, async (file) => {
		const [result] = await analyzeFiles([file], defaultConfig);
		expect(result?.totalFunctions).toBe(0);
	});
});

test("counts only functions in mixed variable declarations", async () => {
	await withTempFile(
		`const notAFunction = 42;
const thisIsAFunction = () => "function";
function main() { return thisIsAFunction(); }`,
		async (file) => {
			const [result] = await analyzeFiles([file], defaultConfig);
			expect(result?.totalFunctions).toBe(2);
		},
	);
});

test("counts exported and non-exported functions consistently", async () => {
	await withTempFile(
		`export const exportedFunc = () => "exported";
const nonExportedFunc = () => "not exported";
export function exportedDecl() { return "decl"; }
function nonExportedDecl() { return "not exported"; }`,
		async (file) => {
			const [result] = await analyzeFiles([file], defaultConfig);
			expect(result?.totalFunctions).toBe(4);
		},
	);
});

// --- Edge cases: call graph ---

test("handles arrow functions in call graph", async () => {
	await withTempFile(
		`const arrowA = () => arrowB();
const arrowB = () => "B";
function main() { return arrowA(); }`,
		async (file) => {
			const [result] = await analyzeFiles([file], defaultConfig);
			expect(result?.violations.length).toBeGreaterThan(0);
		},
	);
});

test("handles function expressions", async () => {
	await withTempFile(
		`const funcExpr = function() { return helper(); };
function helper() { return "helper"; }
function main() { return funcExpr(); }`,
		async (file) => {
			const [result] = await analyzeFiles([file], defaultConfig);
			expect(result?.totalFunctions).toBeGreaterThan(0);
		},
	);
});

test("handles shared dependency (multiple callers)", async () => {
	await withTempFile(
		`function d() { return 42; }
function c() { return d(); }
function b() { return d(); }
function a() { return b() + c(); }`,
		async (file) => {
			const [result] = await analyzeFiles([file], defaultConfig);
			expect(result?.totalFunctions).toBe(4);
			expect(result?.violations.length).toBeGreaterThan(0);
		},
	);
});

test("handles standalone functions with no dependencies", async () => {
	await withTempFile(
		`function a() { return 1; }
function b() { return 2; }
function c() { return 3; }`,
		async (file) => {
			const [result] = await analyzeFiles([file], defaultConfig);
			expect(result?.totalFunctions).toBe(3);
			expect(result?.violations).toHaveLength(0);
		},
	);
});

// --- Edge cases: empty / malformed ---

test("handles empty files", async () => {
	await withTempFile("", async (file) => {
		const [result] = await analyzeFiles([file], defaultConfig);
		expect(result?.totalFunctions).toBe(0);
		expect(result?.violations).toHaveLength(0);
	});
});

test("handles files with only comments", async () => {
	await withTempFile("// comment\n/* block */", async (file) => {
		const [result] = await analyzeFiles([file], defaultConfig);
		expect(result?.totalFunctions).toBe(0);
	});
});
