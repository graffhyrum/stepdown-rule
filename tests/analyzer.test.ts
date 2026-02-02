import { expect, test } from "bun:test";
import { analyzeFiles } from "../src";

test("should detect stepdown violations", async () => {
	const results = await analyzeFiles(["fixtures/test-violations.ts"], {
		ignore: [],
		analyzeArrowFunctions: true,
		analyzeExportsOnly: false,
		reportCircularDependencies: true,
		fix: false,
		json: false,
	});

	expect(results).toHaveLength(1);
	const [result] = results;
	assertDefined(result);
	expect(result.violations).toHaveLength(4);

	const violations = result.violations.map((v) => ({
		caller: v.function.name,
		dependency: v.dependency.name,
	}));

	expect(violations).toContainEqual({
		caller: "_main",
		dependency: "createUser",
	});

	expect(violations).toContainEqual({
		caller: "_main",
		dependency: "validateEmail",
	});

	expect(violations).toContainEqual({
		caller: "createUser",
		dependency: "hashPassword",
	});

	expect(violations).toContainEqual({
		caller: "_processData",
		dependency: "cleanData",
	});
});

test("should detect no violations in properly ordered code", async () => {
	const results = await analyzeFiles(["fixtures/test-correct.ts"], {
		ignore: [],
		analyzeArrowFunctions: true,
		analyzeExportsOnly: false,
		reportCircularDependencies: true,
		fix: false,
		json: false,
	});

	expect(results).toHaveLength(1);
	const [result] = results;
	assertDefined(result);
	expect(result.violations).toHaveLength(0);
});

test("should detect circular dependencies", async () => {
	const results = await analyzeFiles(["fixtures/test-circular.ts"], {
		ignore: [],
		analyzeArrowFunctions: true,
		analyzeExportsOnly: false,
		reportCircularDependencies: true,
		fix: false,
		json: false,
	});

	expect(results).toHaveLength(1);
	const [result] = results;
	assertDefined(result);
	expect(result.circularDependencies.length).toBeGreaterThan(0);
});

function assertDefined<T>(x: T): asserts x is NonNullable<T> {
	expect(x).toBeDefined();
}
