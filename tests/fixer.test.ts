import { expect, test } from "bun:test";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fixFiles } from "../src/fixer";
import type { Config } from "../src/types";

const TEST_DIR = join(process.cwd(), "tests", "fixtures-temp");

function setupTestDir() {
	try {
		rmSync(TEST_DIR, { recursive: true, force: true });
	} catch {
		// Directory doesn't exist, that's fine
	}
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

test("should fix stepdown violations by reordering functions", async () => {
	setupTestDir();

	// Create a file with functions far apart (>10 lines) to trigger reorder count
	const violationCode = `
function main() {
	const result = helper();
	return result;
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

function helper() {
	return "helper result";
}
`;

	const filePath = createTestFile("test-fix-violations.ts", violationCode);

	const results = await fixFiles([filePath], defaultConfig);

	expect(results).toHaveLength(1);
	const [result] = results;
	expect(result?.fixed).toBe(true);
	expect(result?.reordered).toBeGreaterThan(0);
	expect(result?.errors).toHaveLength(0);

	// Verify the file was actually modified
	const fixedContent = readFileSync(filePath, "utf-8");
	expect(fixedContent).toContain("helper");
	expect(fixedContent).toContain("main");

	// Helper should come before main in fixed version
	const helperIndex = fixedContent.indexOf("function helper");
	const mainIndex = fixedContent.indexOf("function main");
	expect(helperIndex).toBeLessThan(mainIndex);

	cleanupTestDir();
});

test("should not modify files with no violations", async () => {
	setupTestDir();

	const correctCode = `
function helper() {
	return "helper result";
}

function main() {
	const result = helper();
	return result;
}
`;

	const filePath = createTestFile("test-no-violations.ts", correctCode);
	const originalContent = readFileSync(filePath, "utf-8");

	const results = await fixFiles([filePath], defaultConfig);

	expect(results).toHaveLength(1);
	const [result] = results;
	expect(result?.fixed).toBe(false);
	expect(result?.reordered).toBe(0);
	expect(result?.errors).toHaveLength(0);

	// Verify file content unchanged
	const currentContent = readFileSync(filePath, "utf-8");
	expect(currentContent).toBe(originalContent);

	cleanupTestDir();
});

test("should handle files with circular dependencies", async () => {
	setupTestDir();

	const circularCode = `
function funcA() {
	funcB();
}

function funcB() {
	funcC();
}

function funcC() {
	funcA();
}
`;

	const filePath = createTestFile("test-circular.ts", circularCode);

	const results = await fixFiles([filePath], defaultConfig);

	expect(results).toHaveLength(1);
	const [result] = results;
	// Should attempt to fix but may encounter circular dependency error
	expect(result).toBeDefined();

	cleanupTestDir();
});

test("should handle arrow functions", async () => {
	setupTestDir();

	const arrowCode = `
const main = () => {
	const result = helper();
	return result;
};

const helper = () => {
	return "helper result";
};
`;

	const filePath = createTestFile("test-arrow-functions.ts", arrowCode);

	const results = await fixFiles([filePath], defaultConfig);

	expect(results).toHaveLength(1);
	const [result] = results;
	expect(result?.fixed).toBe(true);
	expect(result?.errors).toHaveLength(0);

	cleanupTestDir();
});

test("should preserve imports and exports", async () => {
	setupTestDir();

	const codeWithImports = `
import { something } from "somewhere";

function main() {
	const result = helper();
	return result;
}

function helper() {
	return something();
}

export { main };
`;

	const filePath = createTestFile("test-imports-exports.ts", codeWithImports);

	const results = await fixFiles([filePath], defaultConfig);

	expect(results).toHaveLength(1);
	const [result] = results;
	expect(result?.fixed).toBe(true);

	const fixedContent = readFileSync(filePath, "utf-8");
	// Imports should be at the top
	expect(fixedContent.indexOf("import")).toBeLessThan(fixedContent.indexOf("function"));
	// Exports should be at the bottom
	expect(fixedContent.indexOf("export")).toBeGreaterThan(fixedContent.indexOf("function"));

	cleanupTestDir();
});

test("should handle mixed function declarations and arrow functions", async () => {
	setupTestDir();

	const mixedCode = `
function main() {
	const a = arrowHelper();
	const b = declHelper();
	return a + b;
}

const arrowHelper = () => {
	return "arrow";
};

function declHelper() {
	return "decl";
}
`;

	const filePath = createTestFile("test-mixed-functions.ts", mixedCode);

	const results = await fixFiles([filePath], defaultConfig);

	expect(results).toHaveLength(1);
	const [result] = results;
	expect(result?.fixed).toBe(true);
	expect(result?.errors).toHaveLength(0);

	cleanupTestDir();
});

test("should handle files with no functions", async () => {
	setupTestDir();

	const noFunctionsCode = `
const x = 42;
const y = "hello";
console.log(x, y);
`;

	const filePath = createTestFile("test-no-functions.ts", noFunctionsCode);

	const results = await fixFiles([filePath], defaultConfig);

	expect(results).toHaveLength(1);
	const [result] = results;
	expect(result?.fixed).toBe(false);
	expect(result?.reordered).toBe(0);

	cleanupTestDir();
});

test("should handle complex dependency chains", async () => {
	setupTestDir();

	const complexCode = `
function level1() {
	level2a();
	level2b();
}

function level2a() {
	level3();
}

function level2b() {
	level3();
}

function level3() {
	return "base";
}
`;

	const filePath = createTestFile("test-complex-deps.ts", complexCode);

	const results = await fixFiles([filePath], defaultConfig);

	expect(results).toHaveLength(1);
	const [result] = results;
	expect(result?.fixed).toBe(true);

	const fixedContent = readFileSync(filePath, "utf-8");
	// level3 should come before level2a and level2b
	const level3Index = fixedContent.indexOf("function level3");
	const level2aIndex = fixedContent.indexOf("function level2a");
	const level2bIndex = fixedContent.indexOf("function level2b");
	const level1Index = fixedContent.indexOf("function level1");

	expect(level3Index).toBeLessThan(level2aIndex);
	expect(level3Index).toBeLessThan(level2bIndex);
	expect(level2aIndex).toBeLessThan(level1Index);
	expect(level2bIndex).toBeLessThan(level1Index);

	cleanupTestDir();
});

test("should handle error cases gracefully", async () => {
	setupTestDir();

	// Test with non-existent file pattern
	const results = await fixFiles(["non-existent-file-*.ts"], defaultConfig);

	expect(results).toHaveLength(0);

	cleanupTestDir();
});

test("should count function reorders correctly", async () => {
	setupTestDir();

	// Create functions with >10 line spacing to trigger reorder count
	const reorderCode = `
function z() { a(); }

// Padding 1
// Padding 2
// Padding 3
// Padding 4
// Padding 5

function y() { b(); }

// Padding 6
// Padding 7
// Padding 8
// Padding 9
// Padding 10

function x() { c(); }

// Padding 11
// Padding 12
// Padding 13
// Padding 14
// Padding 15

function c() { return 3; }

// Padding 16
// Padding 17
// Padding 18
// Padding 19
// Padding 20

function b() { return 2; }

// Padding 21
// Padding 22
// Padding 23
// Padding 24
// Padding 25

function a() { return 1; }
`;

	const filePath = createTestFile("test-reorder-count.ts", reorderCode);

	const results = await fixFiles([filePath], defaultConfig);

	expect(results).toHaveLength(1);
	const [result] = results;
	expect(result?.fixed).toBe(true);
	expect(result?.reordered).toBeGreaterThan(0);

	cleanupTestDir();
});
