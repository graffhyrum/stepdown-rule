import { expect, test } from "bun:test";
import { fixResultsIndicateFailure } from "../src/cli-output";
import type { FixResult } from "../src/types";

function fixResult(partial: Partial<FixResult>): FixResult {
	return {
		file: "x.ts",
		fixed: false,
		originalContent: "a",
		fixedContent: "a",
		reordered: 0,
		errors: [],
		...partial,
	};
}

test("clean no-op fix results are not failures", () => {
	expect(fixResultsIndicateFailure([fixResult({ fixed: false })])).toBe(false);
});

test("successful rewrite is not a failure", () => {
	expect(
		fixResultsIndicateFailure([
			fixResult({ fixed: true, originalContent: "a", fixedContent: "b", reordered: 1 }),
		]),
	).toBe(false);
});

test("errors mark failure", () => {
	expect(fixResultsIndicateFailure([fixResult({ errors: ["boom"] })])).toBe(true);
});
