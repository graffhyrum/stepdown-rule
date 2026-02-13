import { expect, test } from "bun:test";
import { analyzeFiles } from "../src/analyzer";
import { fixFiles } from "../src/fixer";
import { cleanupTempDir, createTempDir, createTestFile, defaultConfig, fixConfig } from "./helpers";

// --- Core fix behavior ---

test("reorders functions to fix violations", async () => {
	const dir = createTempDir("fixer-temp");
	try {
		const code = `function helper() { return "helper"; }
// padding
// 1
// 2
// 3
// 4
// 5
// 6
// 7
// 8
// 9
// 10
function main() { return helper(); }`;
		const file = await createTestFile(dir, "test.ts", code);
		const [result] = await fixFiles([file], fixConfig);

		expect(result?.fixed).toBe(true);
		expect(result?.reordered).toBeGreaterThan(0);
		expect(result?.errors).toHaveLength(0);

		const content = await Bun.file(file).text();
		expect(content.indexOf("function main")).toBeLessThan(content.indexOf("function helper"));
	} finally {
		cleanupTempDir(dir);
	}
});

test("fixes stepdown when callee-only helper is defined first (multiple callers)", async () => {
	const dir = createTempDir("fixer-temp");
	try {
		const code = `function sharedHelper() { return "ok"; }
function callerA() { return sharedHelper(); }
function callerB() { return sharedHelper(); }
function callerC() { return sharedHelper(); }`;
		const file = await createTestFile(dir, "test.ts", code);
		const [result] = await fixFiles([file], fixConfig);

		expect(result?.fixed, "fixer should fix stepdown violations").toBe(true);
		expect(result?.errors).toHaveLength(0);
		const content = await Bun.file(file).text();
		expect(content).toContain("function sharedHelper()");
		expect(content).toContain("function callerA()");
		expect(content).toContain("function callerB()");
		expect(content).toContain("function callerC()");
		const idxHelper = content.indexOf("function sharedHelper()");
		const idxA = content.indexOf("function callerA()");
		const idxB = content.indexOf("function callerB()");
		const idxC = content.indexOf("function callerC()");
		expect(idxA).toBeLessThan(idxHelper);
		expect(idxB).toBeLessThan(idxHelper);
		expect(idxC).toBeLessThan(idxHelper);
	} finally {
		cleanupTempDir(dir);
	}
});

test("does not modify files with no violations", async () => {
	const dir = createTempDir("fixer-temp");
	try {
		const code = `function main() { return helper(); }
function helper() { return "helper"; }`;
		const file = await createTestFile(dir, "test.ts", code);
		const original = await Bun.file(file).text();

		const [result] = await fixFiles([file], fixConfig);

		expect(result?.fixed).toBe(false);
		expect(result?.reordered).toBe(0);
		expect(await Bun.file(file).text()).toBe(original);
	} finally {
		cleanupTempDir(dir);
	}
});

test("preserves imports and exports", async () => {
	const dir = createTempDir("fixer-temp");
	try {
		const code = `import { something } from "somewhere";
function helper() { return something(); }
function main() { return helper(); }
export { main };`;
		const file = await createTestFile(dir, "test.ts", code);
		const [result] = await fixFiles([file], fixConfig);

		expect(result?.fixed).toBe(true);
		const content = await Bun.file(file).text();
		expect(content.indexOf("import")).toBeLessThan(content.indexOf("function"));
		expect(content.indexOf("export")).toBeGreaterThan(content.indexOf("function"));
	} finally {
		cleanupTempDir(dir);
	}
});

test("handles arrow functions", async () => {
	const dir = createTempDir("fixer-temp");
	try {
		const code = `const helper = () => "helper";
const main = () => helper();`;
		const file = await createTestFile(dir, "test.ts", code);
		const [result] = await fixFiles([file], fixConfig);

		expect(result?.fixed).toBe(true);
		expect(result?.errors).toHaveLength(0);
	} finally {
		cleanupTempDir(dir);
	}
});

test("handles mixed declarations and arrows", async () => {
	const dir = createTempDir("fixer-temp");
	try {
		const code = `const arrowHelper = () => "arrow";
function declHelper() { return "decl"; }
function main() { return arrowHelper() + declHelper(); }`;
		const file = await createTestFile(dir, "test.ts", code);
		const [result] = await fixFiles([file], fixConfig);

		expect(result?.fixed).toBe(true);
		expect(result?.errors).toHaveLength(0);
	} finally {
		cleanupTempDir(dir);
	}
});

test("handles complex dependency chains", async () => {
	const dir = createTempDir("fixer-temp");
	try {
		const code = `function level3() { return "base"; }
function level2a() { level3(); }
function level2b() { level3(); }
function level1() { level2a(); level2b(); }`;
		const file = await createTestFile(dir, "test.ts", code);
		const [result] = await fixFiles([file], fixConfig);

		expect(result?.fixed).toBe(true);
		const content = await Bun.file(file).text();
		const i1 = content.indexOf("function level1");
		const i2a = content.indexOf("function level2a");
		const i2b = content.indexOf("function level2b");
		const i3 = content.indexOf("function level3");
		expect(i1).toBeLessThan(i2a);
		expect(i1).toBeLessThan(i2b);
		expect(i2a).toBeLessThan(i3);
		expect(i2b).toBeLessThan(i3);
	} finally {
		cleanupTempDir(dir);
	}
});

// --- Bead fixtures (1e0, 27g) ---

test("1e0: fixes factory with method calling helper", async () => {
	const dir = createTempDir("fixer-temp");
	try {
		const content = await Bun.file("fixtures/test-factory-method-calls.ts").text();
		const file = await createTestFile(dir, "test.ts", content);
		const [result] = await fixFiles([file], fixConfig);

		expect(result?.fixed).toBe(true);
		expect(result?.errors).toHaveLength(0);
		const [analysis] = await analyzeFiles([file], defaultConfig);
		expect(analysis?.violations.length).toBe(0);
	} finally {
		cleanupTempDir(dir);
	}
});

test("27g: fixes arrow const chain", async () => {
	const dir = createTempDir("fixer-temp");
	try {
		const content = await Bun.file("fixtures/test-arrow-chain.ts").text();
		const file = await createTestFile(dir, "test.ts", content);
		const [result] = await fixFiles([file], fixConfig);

		expect(result?.fixed).toBe(true);
		const [analysis] = await analyzeFiles([file], defaultConfig);
		expect(analysis?.violations.length).toBe(0);
	} finally {
		cleanupTempDir(dir);
	}
});

test("27g: order-repo style - caller above callee", async () => {
	const dir = createTempDir("fixer-temp");
	try {
		const content = await Bun.file("fixtures/test-order-repo-27g.ts").text();
		const file = await createTestFile(dir, "test.ts", content);
		const [result] = await fixFiles([file], fixConfig);

		expect(result?.fixed).toBe(true);
		const fixed = await Bun.file(file).text();
		const createIdx = fixed.indexOf("function createSurrealOrderRepository");
		const mapIdx = fixed.indexOf("const mapValidOrders");
		const parseIdx = fixed.indexOf("const parseSingleOrder");
		const validateIdx = fixed.indexOf("function validateAndParseOrder");
		expect(createIdx).toBeLessThan(mapIdx);
		expect(createIdx).toBeLessThan(parseIdx);
		expect(mapIdx).toBeLessThan(validateIdx);
		expect(parseIdx).toBeLessThan(validateIdx);
	} finally {
		cleanupTempDir(dir);
	}
});

// --- Error / edge cases ---

test("returns empty for non-matching patterns", async () => {
	const dir = createTempDir("fixer-temp");
	try {
		const results = await fixFiles(["non-existent-*.ts"], fixConfig);
		expect(results).toHaveLength(0);
	} finally {
		cleanupTempDir(dir);
	}
});

test("handles files with no functions", async () => {
	const dir = createTempDir("fixer-temp");
	try {
		const file = await createTestFile(dir, "test.ts", "const x = 42;\nconsole.log(x);");
		const [result] = await fixFiles([file], fixConfig);
		expect(result?.fixed).toBe(false);
		expect(result?.reordered).toBe(0);
	} finally {
		cleanupTempDir(dir);
	}
});

test("handles circular dependencies without crashing", async () => {
	const dir = createTempDir("fixer-temp");
	try {
		const code = `function a() { b(); }
function b() { c(); }
function c() { a(); }`;
		const file = await createTestFile(dir, "test.ts", code);
		const [result] = await fixFiles([file], fixConfig);
		expect(result).toBeDefined();
	} finally {
		cleanupTempDir(dir);
	}
});

test("handles files with only imports and exports", async () => {
	const dir = createTempDir("fixer-temp");
	try {
		const file = await createTestFile(dir, "test.ts", `import { x } from "x";\nexport { x };`);
		const [result] = await fixFiles([file], fixConfig);
		expect(result?.fixed).toBe(false);
	} finally {
		cleanupTempDir(dir);
	}
});

test("handles syntax errors gracefully", async () => {
	const dir = createTempDir("fixer-temp");
	try {
		const file = await createTestFile(dir, "test.ts", "function broken() {\n  // no close");
		const [result] = await fixFiles([file], fixConfig);
		expect(result).toBeDefined();
	} finally {
		cleanupTempDir(dir);
	}
});
