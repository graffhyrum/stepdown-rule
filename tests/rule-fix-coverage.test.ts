import { expect, test } from "bun:test";
import { fixFiles } from "../src/fixer";
import type { Config } from "../src/types";
import { analyzeCode, defaultConfig, withTempFile } from "./helpers";

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

function expectFixedOrder(content: string): void {
	const analyzeIdx = content.indexOf("analyzeWithRules");
	const buildIdx = content.indexOf("buildRuleContext");
	expect(analyzeIdx).toBeLessThan(
		buildIdx,
		"analyzeWithRules should now come before buildRuleContext",
	);
}

test("rule-fix: pre-fix violation detection", () => {
	const analysis = analyzeCode(violatingCode);
	expect(analysis.violations.length).toBeGreaterThan(0);
	expect(analysis.violations[0]?.message).toContain("analyzeWithRules calls buildRuleContext");
});

test("rule-fix: detects and fixes stepdown violations when using rules pipeline", async () => {
	await withTempFile(violatingCode, async (file) => {
		const [fixResult] = await fixFiles([file], rulesPipelineConfig);

		expect(fixResult?.fixed, "Should fix the violation").toBe(true);
		expect(fixResult?.errors).toHaveLength(0);

		const fixed = await Bun.file(file).text();
		expect(analyzeCode(fixed).violations.length, "After fix, should have no violations").toBe(0);
		expectFixedOrder(fixed);
	});
});

test("rule-fix: handles exported functions correctly", async () => {
	await withTempFile(
		`function helper(): string { return "h"; }

export function main(): string { return helper(); }`,
		async (file) => {
			const [fixResult] = await fixFiles([file], rulesPipelineConfig);
			expect(fixResult?.fixed).toBe(true);

			const fixed = await Bun.file(file).text();
			expect(analyzeCode(fixed).violations.length).toBe(0);
			expect(fixed).toContain("export function main");
			expect(fixed).toContain("function helper");
		},
	);
});

test("rule-fix: legacy path - fixFiles with no enabledRuleIds", async () => {
	await withTempFile(violatingCode, async (file) => {
		const legacyConfig = { ...defaultConfig, fix: true };
		const [fixResult] = await fixFiles([file], legacyConfig);

		expect(fixResult?.fixed, "Should fix the violation with legacy path").toBe(true);
		expect(fixResult?.errors).toHaveLength(0);

		const fixed = await Bun.file(file).text();
		expect(analyzeCode(fixed).violations.length, "After fix, should have no violations").toBe(0);
		expectFixedOrder(fixed);
	});
});
