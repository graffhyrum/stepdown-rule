import { expect, test } from "bun:test";
import { analyzeFiles } from "../src/analyzer";
import { fixFiles } from "../src/fixer";
import type { Config } from "../src/types";
import { cleanupTempDir, createTempDir, createTestFile, defaultConfig } from "./helpers";

/**
 * Tests that rule-based fixing (fixFileWithRules) correctly handles violations.
 * See: https://github.com/graffhyrum/stepdown-rule/issues/XXX
 */

const rulesPipelineConfig: Config = {
	...defaultConfig,
	fix: true,
	enabledRuleIds: ["stepdown"],
};

test("rule-fix: detects and fixes stepdown violations when using rules pipeline", async () => {
	const dir = createTempDir("rule-fix-temp");
	try {
		// This is the actual violation from src/analyzer.ts
		const code = `function buildRuleContext(parsedFile: ParsedFile): RuleContext {
  return {} as Record<string, unknown>;
}

export function analyzeWithRules(
  parsedFile: ParsedFile,
  enabledRules: Array<unknown>,
): AnalysisResult {
  const ctx = buildRuleContext(parsedFile);
  return {} as Record<string, unknown>;
}`;

		const file = await createTestFile(dir, "test.ts", code);

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
	} finally {
		cleanupTempDir(dir);
	}
});

test("rule-fix: handles exported functions correctly", async () => {
	const dir = createTempDir("rule-fix-temp");
	try {
		const code = `function helper(): string { return "h"; }

export function main(): string { return helper(); }`;

		const file = await createTestFile(dir, "test.ts", code);

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
	} finally {
		cleanupTempDir(dir);
	}
});

test("rule-fix: legacy path - fixFiles with no enabledRuleIds", async () => {
	const dir = createTempDir("rule-fix-temp");
	try {
		// This is the actual violation from src/analyzer.ts
		const code = `function buildRuleContext(parsedFile: ParsedFile): RuleContext {
  return {} as Record<string, unknown>;
}

export function analyzeWithRules(
  parsedFile: ParsedFile,
  enabledRules: Array<unknown>,
): AnalysisResult {
  const ctx = buildRuleContext(parsedFile);
  return {} as Record<string, unknown>;
}`;

		const file = await createTestFile(dir, "test.ts", code);

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
	} finally {
		cleanupTempDir(dir);
	}
});

test("rule pipeline correctly fixes violations with stepdown rule", async () => {
	const dir = createTempDir("rule-fix-temp");
	try {
		// Simple case: stepdown violation with no circular dependencies
		const code = `function buildRuleContext(parsedFile: ParsedFile): RuleContext {
  return {} as Record<string, unknown>;
}

export function analyzeWithRules(
  parsedFile: ParsedFile,
  enabledRules: Array<unknown>,
): AnalysisResult {
  const ctx = buildRuleContext(parsedFile);
  return {} as Record<string, unknown>;
}`;

		const file = await createTestFile(dir, "test.ts", code);

		// Verify violation is detected
		const [analysis] = await analyzeFiles([file], defaultConfig);
		expect(analysis?.violations.length).toBeGreaterThan(0, "Should detect stepdown violation");

		// Fix with rules pipeline
		const [fixResult] = await fixFiles([file], rulesPipelineConfig);

		expect(fixResult?.fixed, "Should fix the stepdown violation").toBe(true);
		expect(fixResult?.errors).toHaveLength(0);

		// Verify the fix worked
		const [reanalysis] = await analyzeFiles([file], defaultConfig);
		expect(reanalysis?.violations.length, "After fix, should have no stepdown violations").toBe(0);

		// Verify content changed - analyzeWithRules should come before buildRuleContext
		const fixed = await Bun.file(file).text();
		const buildIdx = fixed.indexOf("buildRuleContext");
		const analyzeIdx = fixed.indexOf("analyzeWithRules");
		expect(analyzeIdx).toBeLessThan(
			buildIdx,
			"analyzeWithRules should come before buildRuleContext (it calls it)",
		);
	} finally {
		cleanupTempDir(dir);
	}
});
