import { beforeAll, expect, test } from "bun:test";
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { analyzeFiles } from "../src/analyzer";
import { fixFiles } from "../src/fixer";
import { registerDefaultRules } from "../src/register-default-rules";
import { clear } from "../src/registry";
import {
	analyzeCode,
	cleanupTempDir,
	createTempDir,
	fixCode,
	fixConfig,
	totalViolations,
	withTempFile,
} from "./helpers";

beforeAll(() => {
	clear();
	registerDefaultRules();
});

function runFixAnalyzeLoopInMemory(code: string, maxIterations: number): void {
	let content = code;
	let prevViolations = Number.POSITIVE_INFINITY;
	for (let i = 0; i < maxIterations; i++) {
		const count = totalViolations(analyzeCode(content));
		expect(count).toBeLessThanOrEqual(prevViolations);
		prevViolations = count;
		if (count === 0) break;
		content = fixCode(content, fixConfig).fixedContent;
	}
	expect(prevViolations).toBe(0);
}

test("idempotent for simple violations", () => {
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
	const r1 = fixCode(code);
	expect(r1.result.fixed).toBe(true);
	const r2 = fixCode(r1.fixedContent);
	expect(r2.result.fixed).toBe(false);
	expect(r2.fixedContent).toBe(r1.fixedContent);
	const r3 = fixCode(r2.fixedContent);
	expect(r3.result.fixed).toBe(false);
});

test("idempotent for complex dependency chains", () => {
	const code = `function level3() { return "base"; }
function level2a() { level3(); }
function level2b() { level3(); }
function level1() { level2a(); level2b(); }`;
	const r1 = fixCode(code);
	expect(r1.result.fixed).toBe(true);
	const r2 = fixCode(r1.fixedContent);
	expect(r2.result.fixed).toBe(false);
	expect(r2.fixedContent).toBe(r1.fixedContent);
});

test("idempotent for mixed function types", () => {
	const code = `const arrowHelper = () => "arrow";
function declHelper() { return "decl"; }
function main() { return arrowHelper() + declHelper(); }`;
	const r1 = fixCode(code);
	expect(r1.result.fixed).toBe(true);
	const r2 = fixCode(r1.fixedContent);
	expect(r2.result.fixed).toBe(false);
});

test("idempotent when file already complies", () => {
	const code = `function main() { return helper(); }
function helper() { return "helper"; }`;
	const r1 = fixCode(code);
	expect(r1.result.fixed).toBe(false);
	const r2 = fixCode(r1.fixedContent);
	expect(r2.result.fixed).toBe(false);
	expect(r2.fixedContent).toBe(code);
});

test("96h: fix→analyze converges", () => {
	runFixAnalyzeLoopInMemory(
		`const a = () => b();
const b = () => c();
const c = () => "leaf";`,
		5,
	);
});

test("77q: ff-elysia convergence when available", async () => {
	const ffPath = process.env.FF_ELYSIA_PATH ?? join(process.cwd(), "..", "ff-elysia");
	if (!existsSync(ffPath)) return;

	const dir = createTempDir("idempotency-temp");
	const tmpDir = join(dir, "ff-elysia-copy");
	try {
		mkdirSync(tmpDir, { recursive: true });
		cpSync(join(ffPath, "src"), join(tmpDir, "src"), { recursive: true });

		const patterns = [`${tmpDir.replaceAll("\\", "/")}/src/**/*.ts`];
		let prevViolations = Number.POSITIVE_INFINITY;

		for (let i = 0; i < 15; i++) {
			const results = await analyzeFiles(patterns, fixConfig);
			const count = results.reduce((sum, r) => sum + totalViolations(r), 0);
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

	await Promise.all(
		fixtures.map(async (fixture) => {
			const content = await Bun.file(fixture).text();
			runFixAnalyzeLoopInMemory(content, 5);
		}),
	);
});

test("integration: fixFiles disk write is idempotent", async () => {
	await withTempFile(
		`function helper() { return "helper"; }
function main() { return helper(); }`,
		async (file) => {
			const [r1] = await fixFiles([file], fixConfig);
			expect(r1?.fixed).toBe(true);
			const c1 = await Bun.file(file).text();
			const [r2] = await fixFiles([file], fixConfig);
			expect(r2?.fixed).toBe(false);
			expect(await Bun.file(file).text()).toBe(c1);
		},
	);
});
