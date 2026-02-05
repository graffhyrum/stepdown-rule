import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { analyzeFiles } from "../src";
import type { Config } from "../src/types";

const TEST_DIR = join(process.cwd(), "tests", "fixtures-edge-cases");

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

test("should handle variable declarations without names", async () => {
	setupTestDir();

	// Edge case: destructured variable without simple identifier
	const code = `
const { prop } = { prop: () => "test" };
`;

	const filePath = createTestFile("test-no-name.ts", code);
	const results = await analyzeFiles([filePath], defaultConfig);

	expect(results).toHaveLength(1);
	const [result] = results;
	expect(result).toBeDefined();
	// Should not crash, just skip the destructured declaration
	expect(result?.totalFunctions).toBe(0);

	cleanupTestDir();
});

test("should handle variable declarations without initializers", async () => {
	setupTestDir();

	const code = `
let myFunc: () => void;
myFunc = () => console.log("test");
`;

	const filePath = createTestFile("test-no-initializer.ts", code);
	const results = await analyzeFiles([filePath], defaultConfig);

	expect(results).toHaveLength(1);
	const [result] = results;
	expect(result).toBeDefined();
	// Should skip the declaration without initializer
	expect(result?.totalFunctions).toBe(0);

	cleanupTestDir();
});

test("should detect functions with 'this' keyword", async () => {
	setupTestDir();

	// Arrow functions with 'this' cannot be converted to function declarations
	const code = `
const obj = {
	value: 42,
	getValue: function() {
		return this.value;
	}
};

const arrowWithThis = () => {
	return this.value;
};

function regularFunc() {
	return this.value;
}
`;

	const filePath = createTestFile("test-this-keyword.ts", code);
	const results = await analyzeFiles([filePath], defaultConfig);

	expect(results).toHaveLength(1);
	const [result] = results;
	expect(result).toBeDefined();
	// Should detect functions but mark them as not convertible
	expect(result?.totalFunctions).toBeGreaterThan(0);

	cleanupTestDir();
});

test("should detect nested 'this' keyword in function bodies", async () => {
	setupTestDir();

	const code = `
const outer = () => {
	const inner = () => {
		return this.value;
	};
	return inner();
};
`;

	const filePath = createTestFile("test-nested-this.ts", code);
	const results = await analyzeFiles([filePath], defaultConfig);

	expect(results).toHaveLength(1);
	const [result] = results;
	expect(result).toBeDefined();
	expect(result?.totalFunctions).toBeGreaterThan(0);

	cleanupTestDir();
});

test("should handle functions with external variable references (closures)", async () => {
	setupTestDir();

	const code = `
const externalVar = 42;

const closureFunc = () => {
	return externalVar + 10;
};

function main() {
	return closureFunc();
}
`;

	const filePath = createTestFile("test-closure.ts", code);
	const results = await analyzeFiles([filePath], defaultConfig);

	expect(results).toHaveLength(1);
	const [result] = results;
	expect(result).toBeDefined();
	// Should detect the closure and mark it as not convertible
	expect(result?.totalFunctions).toBeGreaterThan(0);

	cleanupTestDir();
});

test("should handle property access expressions correctly", async () => {
	setupTestDir();

	const code = `
const obj = { prop: "value" };

const accessProp = () => {
	return obj.prop;
};

function main() {
	return accessProp();
}
`;

	const filePath = createTestFile("test-property-access.ts", code);
	const results = await analyzeFiles([filePath], defaultConfig);

	expect(results).toHaveLength(1);
	const [result] = results;
	expect(result).toBeDefined();
	expect(result?.totalFunctions).toBeGreaterThan(0);

	cleanupTestDir();
});

test("should handle element access expressions correctly", async () => {
	setupTestDir();

	const code = `
const arr = [1, 2, 3];

const accessElement = () => {
	return arr[0];
};

function main() {
	return accessElement();
}
`;

	const filePath = createTestFile("test-element-access.ts", code);
	const results = await analyzeFiles([filePath], defaultConfig);

	expect(results).toHaveLength(1);
	const [result] = results;
	expect(result).toBeDefined();
	expect(result?.totalFunctions).toBeGreaterThan(0);

	cleanupTestDir();
});

test("should handle nodes without export modifiers", async () => {
	setupTestDir();

	const code = `
const regularConst = 42;

const func = () => {
	return regularConst;
};
`;

	const filePath = createTestFile("test-no-export.ts", code);
	const results = await analyzeFiles([filePath], defaultConfig);

	expect(results).toHaveLength(1);
	const [result] = results;
	expect(result).toBeDefined();

	cleanupTestDir();
});

test("should handle exported functions", async () => {
	setupTestDir();

	const code = `
export function exportedFunc() {
	return "exported";
}

export const exportedArrow = () => {
	return "exported arrow";
};
`;

	const filePath = createTestFile("test-exported.ts", code);
	const results = await analyzeFiles([filePath], defaultConfig);

	expect(results).toHaveLength(1);
	const [result] = results;
	expect(result).toBeDefined();

	cleanupTestDir();
});

test("should handle call expressions at top level (no containing function)", async () => {
	setupTestDir();

	const code = `
function helper() {
	return "helper";
}

// Top-level call expression
const result = helper();
`;

	const filePath = createTestFile("test-top-level-call.ts", code);
	const results = await analyzeFiles([filePath], defaultConfig);

	expect(results).toHaveLength(1);
	const [result] = results;
	expect(result).toBeDefined();
	expect(result?.totalFunctions).toBe(1);

	cleanupTestDir();
});

test("should handle deeply nested function calls", async () => {
	setupTestDir();

	const code = `
function level1() {
	function level2() {
		function level3() {
			return helper();
		}
		return level3();
	}
	return level2();
}

function helper() {
	return "deep";
}
`;

	const filePath = createTestFile("test-deep-nesting.ts", code);
	const results = await analyzeFiles([filePath], defaultConfig);

	expect(results).toHaveLength(1);
	const [result] = results;
	expect(result).toBeDefined();
	expect(result?.totalFunctions).toBeGreaterThan(0);

	cleanupTestDir();
});

test("should handle variable statements with arrow functions in call graph", async () => {
	setupTestDir();

	const code = `
const arrowA = () => {
	return arrowB();
};

const arrowB = () => {
	return "B";
};

function main() {
	return arrowA();
}
`;

	const filePath = createTestFile("test-arrow-call-graph.ts", code);
	const results = await analyzeFiles([filePath], defaultConfig);

	expect(results).toHaveLength(1);
	const [result] = results;
	expect(result).toBeDefined();
	expect(result?.violations.length).toBeGreaterThan(0);

	cleanupTestDir();
});

test("should handle function expressions (not just arrow functions)", async () => {
	setupTestDir();

	const code = `
const funcExpr = function() {
	return helper();
};

function helper() {
	return "helper";
}

function main() {
	return funcExpr();
}
`;

	const filePath = createTestFile("test-func-expression.ts", code);
	const results = await analyzeFiles([filePath], defaultConfig);

	expect(results).toHaveLength(1);
	const [result] = results;
	expect(result).toBeDefined();
	expect(result?.totalFunctions).toBeGreaterThan(0);

	cleanupTestDir();
});

test("should handle mixed variable declarations (some functions, some not)", async () => {
	setupTestDir();

	const code = `
const notAFunction = 42;
const alsoNotAFunction = "string";
const thisIsAFunction = () => "function";

function main() {
	return thisIsAFunction();
}
`;

	const filePath = createTestFile("test-mixed-vars.ts", code);
	const results = await analyzeFiles([filePath], defaultConfig);

	expect(results).toHaveLength(1);
	const [result] = results;
	expect(result).toBeDefined();
	// Should only count the actual function
	expect(result?.totalFunctions).toBe(2); // thisIsAFunction and main

	cleanupTestDir();
});

test("should handle functions that reference each other in complex ways", async () => {
	setupTestDir();

	const code = `
function a() {
	return b() + c();
}

function b() {
	return d();
}

function c() {
	return d();
}

function d() {
	return 42;
}
`;

	const filePath = createTestFile("test-complex-refs.ts", code);
	const results = await analyzeFiles([filePath], defaultConfig);

	expect(results).toHaveLength(1);
	const [result] = results;
	expect(result).toBeDefined();
	expect(result?.totalFunctions).toBe(4);
	expect(result?.violations.length).toBeGreaterThan(0);

	cleanupTestDir();
});

test("should handle empty files", async () => {
	setupTestDir();

	const code = "";

	const filePath = createTestFile("test-empty.ts", code);
	const results = await analyzeFiles([filePath], defaultConfig);

	expect(results).toHaveLength(1);
	const [result] = results;
	expect(result).toBeDefined();
	expect(result?.totalFunctions).toBe(0);
	expect(result?.violations).toHaveLength(0);

	cleanupTestDir();
});

test("should handle files with only comments", async () => {
	setupTestDir();

	const code = `
// This is a comment
/* This is a block comment */
`;

	const filePath = createTestFile("test-comments-only.ts", code);
	const results = await analyzeFiles([filePath], defaultConfig);

	expect(results).toHaveLength(1);
	const [result] = results;
	expect(result).toBeDefined();
	expect(result?.totalFunctions).toBe(0);

	cleanupTestDir();
});

test("should handle functions with no dependencies", async () => {
	setupTestDir();

	const code = `
function standalone1() {
	return 1;
}

function standalone2() {
	return 2;
}

function standalone3() {
	return 3;
}
`;

	const filePath = createTestFile("test-no-deps.ts", code);
	const results = await analyzeFiles([filePath], defaultConfig);

	expect(results).toHaveLength(1);
	const [result] = results;
	expect(result).toBeDefined();
	expect(result?.totalFunctions).toBe(3);
	expect(result?.violations).toHaveLength(0);

	cleanupTestDir();
});
