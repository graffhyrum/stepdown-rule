import { expect, test } from "bun:test";
import { fixFiles } from "../src/fixer";
import { analyzeCode, fixConfig, withTempFile } from "./helpers";

// --- Core fix behavior ---

test("reorders functions to fix violations", async () => {
	await withTempFile(
		`function helper() { return "helper"; }
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
function main() { return helper(); }`,
		async (file) => {
			const [result] = await fixFiles([file], fixConfig);

			expect(result?.fixed).toBe(true);
			expect(result?.reordered).toBeGreaterThan(0);
			expect(result?.errors).toHaveLength(0);

			const content = await Bun.file(file).text();
			expect(content.indexOf("function main")).toBeLessThan(content.indexOf("function helper"));
		},
	);
});

test("fixes stepdown when callee-only helper is defined first (multiple callers)", async () => {
	await withTempFile(
		`function sharedHelper() { return "ok"; }
function callerA() { return sharedHelper(); }
function callerB() { return sharedHelper(); }
function callerC() { return sharedHelper(); }`,
		async (file) => {
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
		},
	);
});

test("does not modify files with no violations", async () => {
	await withTempFile(
		`function main() { return helper(); }
function helper() { return "helper"; }`,
		async (file) => {
			const original = await Bun.file(file).text();

			const [result] = await fixFiles([file], fixConfig);

			expect(result?.fixed).toBe(false);
			expect(result?.reordered).toBe(0);
			expect(await Bun.file(file).text()).toBe(original);
		},
	);
});

test("preserves imports and exports", async () => {
	await withTempFile(
		`import { something } from "somewhere";
function helper() { return something(); }
function main() { return helper(); }
export { main };`,
		async (file) => {
			const [result] = await fixFiles([file], fixConfig);

			expect(result?.fixed).toBe(true);
			const content = await Bun.file(file).text();
			expect(content.indexOf("import")).toBeLessThan(content.indexOf("function"));
			expect(content.indexOf("export")).toBeGreaterThan(content.indexOf("function"));
		},
	);
});

test("handles arrow functions", async () => {
	await withTempFile(
		`const helper = () => "helper";
const main = () => helper();`,
		async (file) => {
			const [result] = await fixFiles([file], fixConfig);

			expect(result?.fixed).toBe(true);
			expect(result?.errors).toHaveLength(0);
		},
	);
});

test("handles mixed declarations and arrows", async () => {
	await withTempFile(
		`const arrowHelper = () => "arrow";
function declHelper() { return "decl"; }
function main() { return arrowHelper() + declHelper(); }`,
		async (file) => {
			const [result] = await fixFiles([file], fixConfig);

			expect(result?.fixed).toBe(true);
			expect(result?.errors).toHaveLength(0);
		},
	);
});

test("handles complex dependency chains", async () => {
	await withTempFile(
		`function level3() { return "base"; }
function level2a() { level3(); }
function level2b() { level3(); }
function level1() { level2a(); level2b(); }`,
		async (file) => {
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
		},
	);
});

// --- Bead fixtures (1e0, 27g) ---

test("1e0: fixes factory with method calling helper", async () => {
	const content = await Bun.file("fixtures/test-factory-method-calls.ts").text();
	await withTempFile(content, async (file) => {
		const [result] = await fixFiles([file], fixConfig);

		expect(result?.fixed).toBe(true);
		expect(result?.errors).toHaveLength(0);
		const fixed = await Bun.file(file).text();
		const analysis = analyzeCode(fixed);
		expect(analysis.violations.length).toBe(0);
	});
});

test("27g: fixes arrow const chain", async () => {
	const content = await Bun.file("fixtures/test-arrow-chain.ts").text();
	await withTempFile(content, async (file) => {
		const [result] = await fixFiles([file], fixConfig);

		expect(result?.fixed).toBe(true);
		const fixed = await Bun.file(file).text();
		const analysis = analyzeCode(fixed);
		expect(analysis.violations.length).toBe(0);
	});
});

test("27g: order-repo style - caller above callee", async () => {
	const content = await Bun.file("fixtures/test-order-repo-27g.ts").text();
	await withTempFile(content, async (file) => {
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
	});
});

// --- Error / edge cases ---

test("returns empty for non-matching patterns", async () => {
	const results = await fixFiles(["non-existent-*.ts"], fixConfig);
	expect(results).toHaveLength(0);
});

test("handles files with no functions", async () => {
	await withTempFile("const x = 42;\nconsole.log(x);", async (file) => {
		const [result] = await fixFiles([file], fixConfig);
		expect(result?.fixed).toBe(false);
		expect(result?.reordered).toBe(0);
	});
});

test("handles circular dependencies without crashing", async () => {
	await withTempFile(
		`function a() { b(); }
function b() { c(); }
function c() { a(); }`,
		async (file) => {
			const [result] = await fixFiles([file], fixConfig);
			expect(result).toBeDefined();
		},
	);
});

test("handles files with only imports and exports", async () => {
	await withTempFile(`import { x } from "x";\nexport { x };`, async (file) => {
		const [result] = await fixFiles([file], fixConfig);
		expect(result?.fixed).toBe(false);
	});
});

test("handles syntax errors gracefully", async () => {
	await withTempFile("function broken() {\n  // no close", async (file) => {
		const [result] = await fixFiles([file], fixConfig);
		expect(result).toBeDefined();
	});
});

test("non-function const stays before functions after fix (no TDZ)", async () => {
	await withTempFile(
		`const CONFIG = { timeout: 5000 };
function helper() { return CONFIG.timeout; }
function main() { return helper(); }`,
		async (file) => {
			const [result] = await fixFiles([file], fixConfig);

			expect(result?.errors).toHaveLength(0);
			const content = await Bun.file(file).text();
			const configIdx = content.indexOf("const CONFIG");
			const mainIdx = content.indexOf("function main");
			const helperIdx = content.indexOf("function helper");
			expect(configIdx).toBeLessThan(mainIdx);
			expect(configIdx).toBeLessThan(helperIdx);
		},
	);
});
