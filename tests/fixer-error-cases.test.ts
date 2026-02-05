import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fixFiles } from "../src/fixer";
import type { Config } from "../src/types";

const TEST_DIR = join(process.cwd(), "tests", "fixtures-fixer-errors");

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

test("should handle files with no violations or circular dependencies", async () => {
	setupTestDir();

	const perfectCode = `
function a() {
	return 1;
}

function b() {
	return a() + 1;
}
`;

	const filePath = createTestFile("test-perfect.ts", perfectCode);

	const results = await fixFiles([filePath], defaultConfig);

	expect(results).toHaveLength(1);
	const [result] = results;
	expect(result?.fixed).toBe(false);
	expect(result?.originalContent).toBe("");
	expect(result?.fixedContent).toBe("");
	expect(result?.reordered).toBe(0);
	expect(result?.errors).toHaveLength(0);

	cleanupTestDir();
});

test("should handle syntax errors gracefully", async () => {
	setupTestDir();

	const invalidCode = `
function broken() {
	// Missing closing brace
`;

	const filePath = createTestFile("test-syntax-error.ts", invalidCode);

	const results = await fixFiles([filePath], defaultConfig);

	expect(results).toHaveLength(1);
	const [result] = results;
	// Should not crash, but may not fix due to syntax error
	expect(result).toBeDefined();

	cleanupTestDir();
});

test("should handle files that cannot be fixed", async () => {
	setupTestDir();

	// Create a file with violations but that might cause issues during fixing
	const problematicCode = `
function main() {
	return helper();
}

const helper = () => {
	return "test";
};
`;

	const filePath = createTestFile("test-problematic.ts", problematicCode);

	const results = await fixFiles([filePath], defaultConfig);

	expect(results).toHaveLength(1);
	const [result] = results;
	expect(result).toBeDefined();
	// Should either fix successfully or report errors
	expect(result?.errors).toBeDefined();

	cleanupTestDir();
});

test("should handle variable declarations without arrow functions", async () => {
	setupTestDir();

	const code = `
const notAFunction = 42;
const alsoNotAFunction = "string";

function main() {
	return notAFunction + alsoNotAFunction.length;
}
`;

	const filePath = createTestFile("test-non-func-vars.ts", code);

	const results = await fixFiles([filePath], defaultConfig);

	expect(results).toHaveLength(1);
	const [result] = results;
	expect(result).toBeDefined();

	cleanupTestDir();
});

test("should handle files with only imports and exports", async () => {
	setupTestDir();

	const code = `
import { something } from "somewhere";
export { something };
`;

	const filePath = createTestFile("test-imports-only.ts", code);

	const results = await fixFiles([filePath], defaultConfig);

	expect(results).toHaveLength(1);
	const [result] = results;
	expect(result?.fixed).toBe(false);

	cleanupTestDir();
});

test("should handle variable statements with function expressions", async () => {
	setupTestDir();

	const code = `
const main = function() {
	return helper();
};

const helper = function() {
	return "test";
};
`;

	const filePath = createTestFile("test-func-expressions.ts", code);

	const results = await fixFiles([filePath], defaultConfig);

	expect(results).toHaveLength(1);
	const [result] = results;
	expect(result).toBeDefined();

	cleanupTestDir();
});

test("should handle files where fixed content equals original", async () => {
	setupTestDir();

	const alreadyCorrectCode = `
function helper() {
	return "helper";
}

function main() {
	return helper();
}
`;

	const filePath = createTestFile("test-already-correct.ts", alreadyCorrectCode);

	const results = await fixFiles([filePath], defaultConfig);

	expect(results).toHaveLength(1);
	const [result] = results;
	expect(result?.fixed).toBe(false);
	expect(result?.originalContent).toBeDefined();
	expect(result?.fixedContent).toBeDefined();
	expect(result?.reordered).toBe(0);
	expect(result?.errors).toHaveLength(0);

	cleanupTestDir();
});

test("should handle catch block errors", async () => {
	setupTestDir();

	// Create a file that might trigger an error during fixing
	const code = `
function main() {
	return circular1();
}

function circular1() {
	return circular2();
}

function circular2() {
	return circular1();
}
`;

	const filePath = createTestFile("test-catch-error.ts", code);

	const results = await fixFiles([filePath], defaultConfig);

	expect(results).toHaveLength(1);
	const [result] = results;
	expect(result).toBeDefined();
	// Should handle the error gracefully
	if (!result?.fixed) {
		expect(result?.errors).toBeDefined();
	}

	cleanupTestDir();
});
