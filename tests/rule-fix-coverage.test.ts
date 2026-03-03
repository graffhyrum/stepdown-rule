import { expect, test } from "bun:test";
import { analyzeFiles } from "../src/analyzer";
import { fixFiles } from "../src/fixer";
import type { Config } from "../src/types";
import { defaultConfig, withTempFile } from "./helpers";

/**
 * Tests that rule-based fixing (fixFileWithRules) correctly handles violations.
 * See: https://github.com/graffhyrum/stepdown-rule/issues/XXX
 */

const rulesPipelineConfig: Config = {
	...defaultConfig,
	fix: true,
	enabledRuleIds: ["stepdown"],
};

const violatingCode = `function buildRuleContext(parsedFile: ParsedFile): RuleContext {
  return {} as Record<string, unknown>;
}

export function analyzeWithRules(
  parsedFile: ParsedFile,
  enabledRules: Array<unknown>,
): AnalysisResult {
  const ctx = buildRuleContext(parsedFile);
  return {} as Record<string, unknown>;
}`;

test("rule-fix: detects and fixes stepdown violations when using rules pipeline", async () => {
	await withTempFile(violatingCode, async (file) => {
		// First verify the violation is detected
		const [analysis] = await analyzeFiles([file], defaultConfig);
		expect(analysis?.violations.length).toBeGreaterThan(0);
		expect(analysis?.violations[0]?.message).toContain("analyzeWithRules calls buildRuleContext");

		// Now fix with the rules pipeline
		const [fixResult] = await fixFiles([file], rulesPipelineConfig);

		expect(fixResult?.fixed, "Should fix the violation").toBe(true);
		expect(fixResult?.errors).toHaveLength(0);

		// Verify that after fixing, there are no violations
		const [reanalysis] = await analyzeFiles([file], defaultConfig);
		expect(reanalysis?.violations.length, "After fix, should have no violations").toBe(0);

		// Verify the content actually changed
		const fixed = await Bun.file(file).text();
		const analyzeIdx = fixed.indexOf("analyzeWithRules");
		const buildIdx = fixed.indexOf("buildRuleContext");
		expect(analyzeIdx).toBeLessThan(
			buildIdx,
			"analyzeWithRules should now come before buildRuleContext",
		);
	});
});

test("rule-fix: handles exported functions correctly", async () => {
	await withTempFile(
		`function helper(): string { return "h"; }

export function main(): string { return helper(); }`,
		async (file) => {
			// Verify violation exists
			const [analysis] = await analyzeFiles([file], defaultConfig);
			expect(analysis?.violations.length).toBeGreaterThan(0);

			// Fix it
			const [fixResult] = await fixFiles([file], rulesPipelineConfig);
			expect(fixResult?.fixed).toBe(true);

			// Verify no violations after fix
			const [reanalysis] = await analyzeFiles([file], defaultConfig);
			expect(reanalysis?.violations.length).toBe(0);

			// Verify content
			const fixed = await Bun.file(file).text();
			expect(fixed).toContain("export function main");
			expect(fixed).toContain("function helper");
		},
	);
});

test("rule-fix: legacy path - fixFiles with no enabledRuleIds", async () => {
	await withTempFile(violatingCode, async (file) => {
		// First verify the violation is detected
		const [analysis] = await analyzeFiles([file], defaultConfig);
		expect(analysis?.violations.length).toBeGreaterThan(0);
		expect(analysis?.violations[0]?.message).toContain("analyzeWithRules calls buildRuleContext");

		// Now fix WITHOUT the rules pipeline (legacy path)
		const legacyConfig = { ...defaultConfig, fix: true };
		const [fixResult] = await fixFiles([file], legacyConfig);

		expect(fixResult?.fixed, "Should fix the violation with legacy path").toBe(true);
		expect(fixResult?.errors).toHaveLength(0);

		// Verify that after fixing, there are no violations
		const [reanalysis] = await analyzeFiles([file], defaultConfig);
		expect(reanalysis?.violations.length, "After fix, should have no violations").toBe(0);

		// Verify the content actually changed
		const fixed = await Bun.file(file).text();
		const analyzeIdx = fixed.indexOf("analyzeWithRules");
		const buildIdx = fixed.indexOf("buildRuleContext");
		expect(analyzeIdx).toBeLessThan(
			buildIdx,
			"analyzeWithRules should now come before buildRuleContext",
		);
	});
});

