import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { analyzeFiles } from "../src";
import type { Config } from "../src/types";

const TEST_DIR = join(process.cwd(), "tests", "fixtures-specific-lines");

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
	fix: false,
	json: false,
};

test("should handle variable declaration without name (line 115)", async () => {
	setupTestDir();

	// This should trigger the early return at line 115 in createVariableFunctionInfo
	const code = `
// Destructured variable without simple identifier
const { method } = {
	method: () => "test"
};
`;

	const filePath = createTestFile("test-line-115.ts", code);
	const results = await analyzeFiles([filePath], defaultConfig);

	expect(results).toHaveLength(1);
	const [result] = results;
	expect(result).toBeDefined();
	// Should not crash, just skip the destructured declaration
	expect(result?.totalFunctions).toBe(0);

	cleanupTestDir();
});

test("should handle variable declaration without initializer (line 115)", async () => {
	setupTestDir();

	// This should also trigger the early return at line 115
	const code = `
let myFunction: () => void;
// Later assignment
myFunction = () => console.log("test");
`;

	const filePath = createTestFile("test-line-115-no-init.ts", code);
	const results = await analyzeFiles([filePath], defaultConfig);

	expect(results).toHaveLength(1);
	const [result] = results;
	expect(result).toBeDefined();
	// Should skip the declaration without initializer
	expect(result?.totalFunctions).toBe(0);

	cleanupTestDir();
});

test("should handle nodes that cannot have modifiers (line 141)", async () => {
	setupTestDir();

	// Test with various node types that can't have export modifiers
	const code = `
// Regular variable statement (can have modifiers)
const regularFunc = () => "test";

// Expression statement (cannot have modifiers)
(() => {
	console.log("IIFE");
})();
`;

	const filePath = createTestFile("test-line-141.ts", code);
	const results = await analyzeFiles([filePath], defaultConfig);

	expect(results).toHaveLength(1);
	const [result] = results;
	expect(result).toBeDefined();
	expect(result?.totalFunctions).toBeGreaterThan(0);

	cleanupTestDir();
});

test("should handle function that equals currentFunction (line 203)", async () => {
	setupTestDir();

	// This tests the early return in hasNoExternalVariableReferences
	// when node === currentFunction
	const code = `
const funcWithClosure = () => {
	const localVar = 42;
	return localVar;
};
`;

	const filePath = createTestFile("test-line-203.ts", code);
	const results = await analyzeFiles([filePath], defaultConfig);

	expect(results).toHaveLength(1);
	const [result] = results;
	expect(result).toBeDefined();
	expect(result?.totalFunctions).toBe(1);

	cleanupTestDir();
});

test("should handle complex closure scenarios", async () => {
	setupTestDir();

	// Test various closure scenarios to ensure all code paths are covered
	const code = `
const outerVar = 100;

const closureFunc = () => {
	const innerVar = 50;
	return outerVar + innerVar;
};

const noClosureFunc = () => {
	const localOnly = 25;
	return localOnly;
};

function regularFunc() {
	return closureFunc();
}
`;

	const filePath = createTestFile("test-closure-complex.ts", code);
	const results = await analyzeFiles([filePath], defaultConfig);

	expect(results).toHaveLength(1);
	const [result] = results;
	expect(result).toBeDefined();
	expect(result?.totalFunctions).toBe(3);

	cleanupTestDir();
});

test("should handle array destructuring in variable declarations", async () => {
	setupTestDir();

	const code = `
const [first, second] = [() => "a", () => "b"];
`;

	const filePath = createTestFile("test-array-destructure.ts", code);
	const results = await analyzeFiles([filePath], defaultConfig);

	expect(results).toHaveLength(1);
	const [result] = results;
	expect(result).toBeDefined();
	// Should skip array destructuring
	expect(result?.totalFunctions).toBe(0);

	cleanupTestDir();
});

test("should handle object destructuring with nested functions", async () => {
	setupTestDir();

	const code = `
const obj = {
	nested: {
		func: () => "test"
	}
};

const { nested: { func } } = obj;
`;

	const filePath = createTestFile("test-nested-destructure.ts", code);
	const results = await analyzeFiles([filePath], defaultConfig);

	expect(results).toHaveLength(1);
	const [result] = results;
	expect(result).toBeDefined();

	cleanupTestDir();
});

test("should handle variable declarations with type annotations but no initializer", async () => {
	setupTestDir();

	const code = `
let typedFunc: () => string;
let anotherTypedFunc: (x: number) => number;

// Later assignments
typedFunc = () => "hello";
anotherTypedFunc = (x) => x * 2;
`;

	const filePath = createTestFile("test-typed-no-init.ts", code);
	const results = await analyzeFiles([filePath], defaultConfig);

	expect(results).toHaveLength(1);
	const [result] = results;
	expect(result).toBeDefined();
	// Should skip declarations without initializers
	expect(result?.totalFunctions).toBe(0);

	cleanupTestDir();
});

test("should handle const declarations with non-function values", async () => {
	setupTestDir();

	const code = `
const number = 42;
const string = "hello";
const object = { key: "value" };
const array = [1, 2, 3];

function useConstants() {
	return number + string.length + array.length;
}
`;

	const filePath = createTestFile("test-non-func-consts.ts", code);
	const results = await analyzeFiles([filePath], defaultConfig);

	expect(results).toHaveLength(1);
	const [result] = results;
	expect(result).toBeDefined();
	// Should only count the actual function
	expect(result?.totalFunctions).toBe(1);

	cleanupTestDir();
});

test("should handle mixed export and non-export variable statements", async () => {
	setupTestDir();

	const code = `
export const exportedFunc = () => "exported";

const nonExportedFunc = () => "not exported";

export function exportedDecl() {
	return "exported declaration";
}

function nonExportedDecl() {
	return "not exported declaration";
}
`;

	const filePath = createTestFile("test-mixed-exports.ts", code);
	const results = await analyzeFiles([filePath], defaultConfig);

	expect(results).toHaveLength(1);
	const [result] = results;
	expect(result).toBeDefined();
	// All functions counted including exported variable statements (obe: consistent handling)
	expect(result?.totalFunctions).toBe(4); // exportedFunc, nonExportedFunc, exportedDecl, nonExportedDecl

	cleanupTestDir();
});
