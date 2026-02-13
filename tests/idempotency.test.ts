import { expect, test } from "bun:test";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { analyzeFiles } from "../src/analyzer";
import { fixFiles } from "../src/fixer";
import type { Config } from "../src/types";

const TEST_DIR = join(process.cwd(), "tests", "fixtures-idempotency");

function setupTestDir() {
	cleanupTestDir();
	mkdirSync(TEST_DIR, { recursive: true });
}

function cleanupTestDir() {
	try {
		rmSync(TEST_DIR, { recursive: true, force: true });
	} catch {
		// Ignore cleanup errors
	}
}

function createTestFile(filename: string, content: string): string {
	const filePath = join(TEST_DIR, filename);
	writeFileSync(filePath, content, "utf-8");
	return filePath;
}

const defaultConfig: Config = {
	ignore: [],
	analyzeArrowFunctions: true,
	analyzeExportsOnly: false,
	reportCircularDependencies: true,
	fix: true,
	json: false,
};

test("should be idempotent for simple violations", async () => {
	setupTestDir();

	const code = `
function helper() {
	return "helper";
}

// Padding to ensure >10 line difference
// Line 1
// Line 2
// Line 3
// Line 4
// Line 5
// Line 6
// Line 7
// Line 8
// Line 9
// Line 10

function main() {
	const result = helper();
	return result;
}
`;

	const filePath = createTestFile("test-idempotent-simple.ts", code);

	// First fix
	const results1 = await fixFiles([filePath], defaultConfig);
	expect(results1).toHaveLength(1);
	expect(results1[0]?.fixed).toBe(true);
	const content1 = readFileSync(filePath, "utf-8");

	// Second fix—should be no changes
	const results2 = await fixFiles([filePath], defaultConfig);
	expect(results2).toHaveLength(1);
	expect(results2[0]?.fixed).toBe(false);
	const content2 = readFileSync(filePath, "utf-8");

	// Content should not change between runs
	expect(content1).toBe(content2);

	// Third fix—should still be no changes
	const results3 = await fixFiles([filePath], defaultConfig);
	expect(results3).toHaveLength(1);
	expect(results3[0]?.fixed).toBe(false);
	const content3 = readFileSync(filePath, "utf-8");

	expect(content2).toBe(content3);

	cleanupTestDir();
});

test("should be idempotent for complex dependency chains", async () => {
	setupTestDir();

	const code = `
function level3() {
	return "base";
}

function level2a() {
	level3();
}

function level2b() {
	level3();
}

function level1() {
	level2a();
	level2b();
}
`;

	const filePath = createTestFile("test-idempotent-chain.ts", code);

	// First fix
	const results1 = await fixFiles([filePath], defaultConfig);
	expect(results1).toHaveLength(1);
	expect(results1[0]?.fixed).toBe(true);
	const content1 = readFileSync(filePath, "utf-8");

	// Second fix—should be no changes
	const results2 = await fixFiles([filePath], defaultConfig);
	expect(results2).toHaveLength(1);
	expect(results2[0]?.fixed).toBe(false);
	const content2 = readFileSync(filePath, "utf-8");

	expect(content1).toBe(content2);

	cleanupTestDir();
});

test("should be idempotent for mixed function types", async () => {
	setupTestDir();

	const code = `
const arrowHelper = () => {
	return "arrow";
};

function declHelper() {
	return "decl";
}

function main() {
	const a = arrowHelper();
	const b = declHelper();
	return a + b;
}
`;

	const filePath = createTestFile("test-idempotent-mixed.ts", code);

	// First fix
	const results1 = await fixFiles([filePath], defaultConfig);
	expect(results1).toHaveLength(1);
	expect(results1[0]?.fixed).toBe(true);
	const content1 = readFileSync(filePath, "utf-8");

	// Second fix—should be no changes
	const results2 = await fixFiles([filePath], defaultConfig);
	expect(results2).toHaveLength(1);
	expect(results2[0]?.fixed).toBe(false);
	const content2 = readFileSync(filePath, "utf-8");

	expect(content1).toBe(content2);

	cleanupTestDir();
});

test("should be idempotent even if file already complies", async () => {
	setupTestDir();

	const code = `
function main() {
	const result = helper();
	return result;
}

function helper() {
	return "helper";
}
`;

	const filePath = createTestFile("test-idempotent-compliant.ts", code);
	const originalContent = readFileSync(filePath, "utf-8");

	// First fix—should be no changes (already compliant)
	const results1 = await fixFiles([filePath], defaultConfig);
	expect(results1).toHaveLength(1);
	expect(results1[0]?.fixed).toBe(false);

	// Second fix—should also be no changes
	const results2 = await fixFiles([filePath], defaultConfig);
	expect(results2).toHaveLength(1);
	expect(results2[0]?.fixed).toBe(false);

	const content = readFileSync(filePath, "utf-8");
	expect(content).toBe(originalContent);

	cleanupTestDir();
});

test("96h: fix→analyze loop must not increase violations (convergence)", async () => {
	setupTestDir();

	const code = `
const a = () => b();
const b = () => c();
const c = () => "leaf";
`;
	const filePath = createTestFile("test-convergence.ts", code);

	let prevViolations = Number.POSITIVE_INFINITY;
	for (let i = 0; i < 5; i++) {
		const [result] = await analyzeFiles([filePath], defaultConfig);
		const count = (result?.violations.length ?? 0) + (result?.nestedFunctionViolations.length ?? 0);
		expect(count).toBeLessThanOrEqual(prevViolations);
		prevViolations = count;
		if (count === 0) break;
		await fixFiles([filePath], defaultConfig);
	}

	expect(prevViolations).toBe(0);
	cleanupTestDir();
});

test("96h/1e0: bead fixtures (mutual-pairs, cart, topo, arrow-chain, factory-refs, rate-limit, container-di, factory-method-calls) must converge", async () => {
	const fixtures = [
		"fixtures/test-mutual-pairs.ts",
		"fixtures/test-cart-pingpong.ts",
		"fixtures/test-topo-order-sensitive.ts",
		"fixtures/test-arrow-chain.ts",
		"fixtures/test-factory-refs.ts",
		"fixtures/test-rate-limit-pattern.ts",
		"fixtures/test-container-di.ts",
		"fixtures/test-factory-method-calls.ts",
	];

	for (const fixture of fixtures) {
		const content = readFileSync(fixture, "utf-8");
		setupTestDir();
		const filePath = createTestFile("bead-fixture.ts", content);

		let prevViolations = Number.POSITIVE_INFINITY;
		for (let i = 0; i < 5; i++) {
			const [result] = await analyzeFiles([filePath], defaultConfig);
			const count =
				(result?.violations.length ?? 0) + (result?.nestedFunctionViolations.length ?? 0);
			expect(count).toBeLessThanOrEqual(prevViolations);
			prevViolations = count;
			if (count === 0) break;
			await fixFiles([filePath], defaultConfig);
		}

		expect(prevViolations).toBe(0);
		cleanupTestDir();
	}
});
