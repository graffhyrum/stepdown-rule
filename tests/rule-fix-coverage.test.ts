import { beforeAll, expect, test } from "bun:test";
import { fixFiles } from "../src/fixer";
import { registerDefaultRules } from "../src/register-default-rules";
import { clear } from "../src/registry";
import type { Config } from "../src/types";
import { analyzeCode, defaultConfig, fixCode, withTempFile } from "./helpers";

beforeAll(() => {
	clear();
	registerDefaultRules();
});

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
	expect(analyzeIdx, "analyzeWithRules should now come before buildRuleContext").toBeLessThan(
		buildIdx,
	);
}

test("rule-fix: pre-fix violation detection", () => {
	const analysis = analyzeCode(violatingCode);
	expect(analysis.violations.length).toBeGreaterThan(0);
	expect(analysis.violations[0]?.message).toContain("analyzeWithRules calls buildRuleContext");
});

test("rule-fix: detects and fixes stepdown violations when using rules pipeline", () => {
	const { result, fixedContent, after } = fixCode(violatingCode, rulesPipelineConfig);
	expect(result.fixed, "Should fix the violation").toBe(true);
	expect(result.errors).toHaveLength(0);
	expect(after.violations.length, "After fix, should have no violations").toBe(0);
	expectFixedOrder(fixedContent);
});

test("rule-fix: handles exported functions correctly", () => {
	const code = `function helper(): string { return "h"; }

export function main(): string { return helper(); }`;
	const { result, fixedContent, after } = fixCode(code, rulesPipelineConfig);
	expect(result.fixed).toBe(true);
	expect(after.violations.length).toBe(0);
	expect(fixedContent).toContain("export function main");
	expect(fixedContent).toContain("function helper");
});

test("rule-fix: no enabledRuleIds uses all registered rules", () => {
	const defaultRulesConfig = { ...defaultConfig, fix: true };
	const { result, fixedContent, after } = fixCode(violatingCode, defaultRulesConfig);
	expect(result.fixed, "Should fix the violation via rule pipeline").toBe(true);
	expect(result.errors).toHaveLength(0);
	expect(after.violations.length, "After fix, should have no violations").toBe(0);
	expectFixedOrder(fixedContent);
});

test("integration: fixFiles rules pipeline writes to disk", async () => {
	await withTempFile(violatingCode, async (file) => {
		const [fixResult] = await fixFiles([file], rulesPipelineConfig);
		expect(fixResult?.fixed, "Should fix the violation").toBe(true);
		const fixed = await Bun.file(file).text();
		expect(analyzeCode(fixed).violations.length).toBe(0);
		expectFixedOrder(fixed);
	});
});
