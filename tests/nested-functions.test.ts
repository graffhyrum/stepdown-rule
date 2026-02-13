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

test("should detect nested function before logic statements when not referenced", async () => {
	const fixture = "fixtures/test-nested-violation.ts";
	const results = await analyzeFiles([fixture], config);
	const result = results[0];
	assertDefined(result);

	expect(result.nestedFunctionViolations.length).toBeGreaterThan(0);
	const violation = result.nestedFunctionViolations[0];
	assertDefined(violation);
	expect(violation.nested.name).toBe("helper");
	expect(violation.parent.name).toBe("parent");
	expect(violation.message).toContain("should appear after all logic");
});

test("should not flag nested function after return statement", async () => {
	const fixture = "fixtures/test-nested-correct.ts";
	const results = await analyzeFiles([fixture], config);
	const result = results[0];
	assertDefined(result);

	expect(result.nestedFunctionViolations.length).toBe(0);
});

test("should not flag nested function when referenced in return statement", async () => {
	// Create a temporary fixture for this test
	const tempFixture = `
function parent() {
	function helper() {
		return "I help";
	}
	return helper();
}
`;
	const tempFile = "/tmp/test-referenced-nested.ts";
	await Bun.write(tempFile, tempFixture);

	const results = await analyzeFiles([tempFile], config);
	const result = results[0];
	assertDefined(result);

	expect(result.nestedFunctionViolations.length).toBe(0);
});

test("should not flag nested arrow functions when referenced", async () => {
	const fixture = "fixtures/test-nested-arrow.ts";
	const results = await analyzeFiles([fixture], config);
	const result = results[0];
	assertDefined(result);

	// The helper is referenced in return helper(), so no violation
	expect(result.nestedFunctionViolations.length).toBe(0);
});

test("should not flag multiple nested functions when referenced", async () => {
	const fixture = "fixtures/test-nested-multiple.ts";
	const results = await analyzeFiles([fixture], config);
	const result = results[0];
	assertDefined(result);

	// The helpers are referenced in the return object, so no violations
	expect(result.nestedFunctionViolations.length).toBe(0);
});

test("should not flag nested function when referenced in logic", async () => {
	const fixture = "fixtures/test-nested-no-return.ts";
	const results = await analyzeFiles([fixture], config);
	const result = results[0];

	// The helper is referenced in the logic statement helper(), so no violation
	assertDefined(result);
	expect(result.nestedFunctionViolations.length).toBe(0);
});

function assertDefined<T>(x: T): asserts x is NonNullable<T> {
	expect(x).toBeDefined();
}
