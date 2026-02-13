import { expect, test } from "bun:test";
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { analyzeFiles } from "../src/analyzer";
import { fixFiles } from "../src/fixer";
import { cleanupTempDir, createTempDir, createTestFile, fixConfig } from "./helpers";

function runFixAnalyzeLoop(filePath: string, config: typeof fixConfig, maxIterations: number) {
	return async () => {
		let prevViolations = Number.POSITIVE_INFINITY;
		for (let i = 0; i < maxIterations; i++) {
			const [result] = await analyzeFiles([filePath], config);
			const count =
				(result?.violations.length ?? 0) + (result?.nestedFunctionViolations.length ?? 0);
			expect(count).toBeLessThanOrEqual(prevViolations);
			prevViolations = count;
			if (count === 0) break;
			await fixFiles([filePath], config);
		}
		expect(prevViolations).toBe(0);
	};
}

test("idempotent for simple violations", async () => {
	const dir = createTempDir("idempotency-temp");
	try {
		const code = `function helper() { return "helper"; }
// padding 1-10
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

		const [r1] = await fixFiles([file], fixConfig);
		expect(r1?.fixed).toBe(true);
		const c1 = await Bun.file(file).text();

		const [r2] = await fixFiles([file], fixConfig);
		expect(r2?.fixed).toBe(false);
		expect(await Bun.file(file).text()).toBe(c1);

		const [r3] = await fixFiles([file], fixConfig);
		expect(r3?.fixed).toBe(false);
	} finally {
		cleanupTempDir(dir);
	}
});

test("idempotent for complex dependency chains", async () => {
	const dir = createTempDir("idempotency-temp");
	try {
		const code = `function level3() { return "base"; }
function level2a() { level3(); }
function level2b() { level3(); }
function level1() { level2a(); level2b(); }`;
		const file = await createTestFile(dir, "test.ts", code);

		const [r1] = await fixFiles([file], fixConfig);
		expect(r1?.fixed).toBe(true);
		const c1 = await Bun.file(file).text();

		const [r2] = await fixFiles([file], fixConfig);
		expect(r2?.fixed).toBe(false);
		expect(await Bun.file(file).text()).toBe(c1);
	} finally {
		cleanupTempDir(dir);
	}
});

test("idempotent for mixed function types", async () => {
	const dir = createTempDir("idempotency-temp");
	try {
		const code = `const arrowHelper = () => "arrow";
function declHelper() { return "decl"; }
function main() { return arrowHelper() + declHelper(); }`;
		const file = await createTestFile(dir, "test.ts", code);

		const [r1] = await fixFiles([file], fixConfig);
		expect(r1?.fixed).toBe(true);
		const [r2] = await fixFiles([file], fixConfig);
		expect(r2?.fixed).toBe(false);
	} finally {
		cleanupTempDir(dir);
	}
});

test("idempotent when file already complies", async () => {
	const dir = createTempDir("idempotency-temp");
	try {
		const code = `function main() { return helper(); }
function helper() { return "helper"; }`;
		const file = await createTestFile(dir, "test.ts", code);
		const original = await Bun.file(file).text();

		const [r1] = await fixFiles([file], fixConfig);
		expect(r1?.fixed).toBe(false);
		const [r2] = await fixFiles([file], fixConfig);
		expect(r2?.fixed).toBe(false);
		expect(await Bun.file(file).text()).toBe(original);
	} finally {
		cleanupTempDir(dir);
	}
});

test("96h: fix→analyze converges", async () => {
	const dir = createTempDir("idempotency-temp");
	try {
		const file = await createTestFile(
			dir,
			"test.ts",
			`const a = () => b();
const b = () => c();
const c = () => "leaf";`,
		);
		await runFixAnalyzeLoop(file, fixConfig, 5)();
	} finally {
		cleanupTempDir(dir);
	}
});

test("77q: ff-elysia convergence when available", async () => {
	const ffPath = process.env.FF_ELYSIA_PATH ?? join(process.cwd(), "..", "ff-elysia");
	if (!existsSync(ffPath)) return;

	const dir = createTempDir("idempotency-temp");
	const tmpDir = join(dir, "ff-elysia-copy");
	try {
		mkdirSync(tmpDir, { recursive: true });
		cpSync(join(ffPath, "src"), join(tmpDir, "src"), { recursive: true });

		const patterns = [join(tmpDir, "src", "**", "*.ts")];
		let prevViolations = Number.POSITIVE_INFINITY;

		for (let i = 0; i < 15; i++) {
			const results = await analyzeFiles(patterns, fixConfig);
			const count = results.reduce(
				(sum, r) => sum + (r.violations?.length ?? 0) + (r.nestedFunctionViolations?.length ?? 0),
				0,
			);
			expect(count).toBeLessThanOrEqual(prevViolations);
			prevViolations = count;
			if (count === 0) break;
			await fixFiles(patterns, fixConfig);
		}
		expect(prevViolations).toBe(0);
	} finally {
		cleanupTempDir(dir);
	}
});

test("96h/1e0/27g: bead fixtures converge", async () => {
	const fixtures = [
		"fixtures/test-mutual-pairs.ts",
		"fixtures/test-cart-pingpong.ts",
		"fixtures/test-topo-order-sensitive.ts",
		"fixtures/test-arrow-chain.ts",
		"fixtures/test-order-repo-27g.ts",
		"fixtures/test-factory-refs.ts",
		"fixtures/test-rate-limit-pattern.ts",
		"fixtures/test-container-di.ts",
		"fixtures/test-factory-method-calls.ts",
	];

	for (const fixture of fixtures) {
		const dir = createTempDir("idempotency-temp");
		try {
			const content = await Bun.file(fixture).text();
			const file = await createTestFile(dir, "bead.ts", content);
			await runFixAnalyzeLoop(file, fixConfig, 5)();
		} finally {
			cleanupTempDir(dir);
		}
	}
});
