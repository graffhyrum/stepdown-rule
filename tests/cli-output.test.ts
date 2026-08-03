import { expect, test } from "bun:test";
import {
	boundedPreview,
	exitCodeFromErrors,
	fixResultsIndicateFailure,
	ruleDescription,
	toAgentsFixResults,
} from "../src/cli-output";
import { ExitConfig, ExitInternal, ExitNoFiles, ExitUsage } from "../src/exit-codes";
import { createHumanReporter } from "../src/reporter-human";
import type { FixResult } from "../src/types";
import { withCapturedIo } from "./cli-harness";

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

test("exitCodeFromErrors maps known codes", () => {
	expect(exitCodeFromErrors([{ code: "CONFIG_ERROR", message: "x" }])).toBe(ExitConfig);
	expect(exitCodeFromErrors([{ code: "NO_FILES", message: "x" }])).toBe(ExitNoFiles);
	expect(exitCodeFromErrors([{ code: "USAGE", message: "x" }])).toBe(ExitUsage);
	expect(exitCodeFromErrors([{ code: "INTERNAL_ERROR", message: "x" }])).toBe(ExitInternal);
});

test("ruleDescription returns catalog text or id", () => {
	expect(ruleDescription("stepdown")).toContain("Caller-before-callee");
	expect(ruleDescription("unknown-rule")).toBe("unknown-rule");
});

test("boundedPreview empty when identical", () => {
	expect(boundedPreview("same", "same")).toBe("");
});

test("toAgentsFixResults includes content when requested", () => {
	const results = toAgentsFixResults(
		[fixResult({ fixed: true, originalContent: "old", fixedContent: "new", reordered: 1 })],
		{ dryRun: false, includeContent: true },
	);
	expect(results[0]?.originalContent).toBe("old");
	expect(results[0]?.fixedContent).toBe("new");
	expect(results[0]?.preview).toBeUndefined();
});

test("toAgentsFixResults dry-run preview without content", () => {
	const results = toAgentsFixResults(
		[fixResult({ fixed: true, originalContent: "old\n", fixedContent: "new\n", reordered: 1 })],
		{ dryRun: true, includeContent: false },
	);
	expect(results[0]?.preview).toBeDefined();
	expect(results[0]?.originalContent).toBeUndefined();
});

test("human reporter prints fix failures", async () => {
	const { result: code, stdout } = await withCapturedIo(() =>
		createHumanReporter().reportFix([
			fixResult({ file: "bad.ts", fixed: false, errors: ["disk full"] }),
		]),
	);
	expect(code).toBe(1);
	expect(stdout).toMatch(/Failed: bad\.ts/);
	expect(stdout).toContain("disk full");
});
