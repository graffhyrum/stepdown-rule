import { expect, test } from "bun:test";
import { analyzeFiles } from "../src/analyzer";
import { cleanupTempDir, createTempDir, createTestFile, defaultConfig } from "./helpers";

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
	const dir = createTempDir("analyzer-temp");
	try {
		const file = await createTestFile(dir, "test.ts", `const { prop } = { prop: () => "test" };`);
		const [result] = await analyzeFiles([file], defaultConfig);
		expect(result?.totalFunctions).toBe(0);
	} finally {
		cleanupTempDir(dir);
	}
});

test("skips declarations without initializer", async () => {
	const dir = createTempDir("analyzer-temp");
	try {
		const file = await createTestFile(
			dir,
			"test.ts",
			`let myFunc: () => void;\nmyFunc = () => console.log("test");`,
		);
		const [result] = await analyzeFiles([file], defaultConfig);
		expect(result?.totalFunctions).toBe(0);
	} finally {
		cleanupTempDir(dir);
	}
});

test("skips array destructuring", async () => {
	const dir = createTempDir("analyzer-temp");
	try {
		const file = await createTestFile(
			dir,
			"test.ts",
			`const [first, second] = [() => "a", () => "b"];`,
		);
		const [result] = await analyzeFiles([file], defaultConfig);
		expect(result?.totalFunctions).toBe(0);
	} finally {
		cleanupTempDir(dir);
	}
});

test("counts only functions in mixed variable declarations", async () => {
	const dir = createTempDir("analyzer-temp");
	try {
		const file = await createTestFile(
			dir,
			"test.ts",
			`const notAFunction = 42;
const thisIsAFunction = () => "function";
function main() { return thisIsAFunction(); }`,
		);
		const [result] = await analyzeFiles([file], defaultConfig);
		expect(result?.totalFunctions).toBe(2);
	} finally {
		cleanupTempDir(dir);
	}
});

test("counts exported and non-exported functions consistently", async () => {
	const dir = createTempDir("analyzer-temp");
	try {
		const file = await createTestFile(
			dir,
			"test.ts",
			`export const exportedFunc = () => "exported";
const nonExportedFunc = () => "not exported";
export function exportedDecl() { return "decl"; }
function nonExportedDecl() { return "not exported"; }`,
		);
		const [result] = await analyzeFiles([file], defaultConfig);
		expect(result?.totalFunctions).toBe(4);
	} finally {
		cleanupTempDir(dir);
	}
});

// --- Edge cases: call graph ---

test("handles arrow functions in call graph", async () => {
	const dir = createTempDir("analyzer-temp");
	try {
		const file = await createTestFile(
			dir,
			"test.ts",
			`const arrowA = () => arrowB();
const arrowB = () => "B";
function main() { return arrowA(); }`,
		);
		const [result] = await analyzeFiles([file], defaultConfig);
		expect(result?.violations.length).toBeGreaterThan(0);
	} finally {
		cleanupTempDir(dir);
	}
});

test("handles function expressions", async () => {
	const dir = createTempDir("analyzer-temp");
	try {
		const file = await createTestFile(
			dir,
			"test.ts",
			`const funcExpr = function() { return helper(); };
function helper() { return "helper"; }
function main() { return funcExpr(); }`,
		);
		const [result] = await analyzeFiles([file], defaultConfig);
		expect(result?.totalFunctions).toBeGreaterThan(0);
	} finally {
		cleanupTempDir(dir);
	}
});

test("handles shared dependency (multiple callers)", async () => {
	const dir = createTempDir("analyzer-temp");
	try {
		const file = await createTestFile(
			dir,
			"test.ts",
			`function d() { return 42; }
function c() { return d(); }
function b() { return d(); }
function a() { return b() + c(); }`,
		);
		const [result] = await analyzeFiles([file], defaultConfig);
		expect(result?.totalFunctions).toBe(4);
		expect(result?.violations.length).toBeGreaterThan(0);
	} finally {
		cleanupTempDir(dir);
	}
});

test("handles standalone functions with no dependencies", async () => {
	const dir = createTempDir("analyzer-temp");
	try {
		const file = await createTestFile(
			dir,
			"test.ts",
			`function a() { return 1; }
function b() { return 2; }
function c() { return 3; }`,
		);
		const [result] = await analyzeFiles([file], defaultConfig);
		expect(result?.totalFunctions).toBe(3);
		expect(result?.violations).toHaveLength(0);
	} finally {
		cleanupTempDir(dir);
	}
});

// --- Edge cases: empty / malformed ---

test("handles empty files", async () => {
	const dir = createTempDir("analyzer-temp");
	try {
		const file = await createTestFile(dir, "test.ts", "");
		const [result] = await analyzeFiles([file], defaultConfig);
		expect(result?.totalFunctions).toBe(0);
		expect(result?.violations).toHaveLength(0);
	} finally {
		cleanupTempDir(dir);
	}
});

test("handles files with only comments", async () => {
	const dir = createTempDir("analyzer-temp");
	try {
		const file = await createTestFile(dir, "test.ts", "// comment\n/* block */");
		const [result] = await analyzeFiles([file], defaultConfig);
		expect(result?.totalFunctions).toBe(0);
	} finally {
		cleanupTempDir(dir);
	}
});
