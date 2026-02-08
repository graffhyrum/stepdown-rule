import { expect, test } from "bun:test";
import { analyzeFiles } from "../src/analyzer";
import type { Config } from "../src/types";

const config: Config = {
	ignore: [],
	analyzeArrowFunctions: true,
	analyzeExportsOnly: false,
	reportCircularDependencies: true,
	fix: false,
	json: false,
	outputFile: undefined,
};

test("should detect nested function before return statement", async () => {
	const fixture = "fixtures/test-nested-violation.ts";
	const results = await analyzeFiles([fixture], config);
	const result = results[0];
	assertDefined(result);

	expect(result.nestedFunctionViolations.length).toBeGreaterThan(0);
	const violation = result.nestedFunctionViolations[0];
	assertDefined(violation);
	expect(violation.nested.name).toBe("helper");
	expect(violation.parent.name).toBe("parent");
	expect(violation.message).toContain("should appear after return statement");
});

test("should not flag nested function after return statement", async () => {
	const fixture = "fixtures/test-nested-correct.ts";
	const results = await analyzeFiles([fixture], config);
	const result = results[0];
	assertDefined(result);

	expect(result.nestedFunctionViolations.length).toBe(0);
});

test("should handle nested arrow functions", async () => {
	const fixture = "fixtures/test-nested-arrow.ts";
	const results = await analyzeFiles([fixture], config);
	const result = results[0];
	assertDefined(result);

	expect(result.nestedFunctionViolations.length).toBeGreaterThan(0);
	const violation = result.nestedFunctionViolations[0];
	assertDefined(violation);
	expect(violation.nested.kind).toBe("arrow-function");
});

test("should handle multiple nested functions", async () => {
	const fixture = "fixtures/test-nested-multiple.ts";
	const results = await analyzeFiles([fixture], config);
	const result = results[0];
	assertDefined(result);

	expect(result.nestedFunctionViolations.length).toBeGreaterThanOrEqual(2);
});

test("should ignore nested functions with no return statement", async () => {
	const fixture = "fixtures/test-nested-no-return.ts";
	const results = await analyzeFiles([fixture], config);
	const result = results[0];

	// Functions without return statements should not trigger violations
	// (all nested functions would be flagged as "before" return at line MAX_SAFE_INTEGER)
	assertDefined(result);
	expect(result.nestedFunctionViolations.length).toBe(0);
});

function assertDefined<T>(x: T): asserts x is NonNullable<T> {
	expect(x).toBeDefined();
}
