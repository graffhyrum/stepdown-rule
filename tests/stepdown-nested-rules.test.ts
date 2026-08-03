import { beforeAll, expect, test } from "bun:test";
import { nestedRule } from "../src/nested-rule";
import { registerDefaultRules } from "../src/register-default-rules";
import { clear } from "../src/registry";
import { stepdownRule } from "../src/stepdown-rule";
import { getViolationFixture } from "../src/violation-coverage";
import { fixCode, parseRuleContext, totalViolations } from "./helpers";

beforeAll(() => {
	clear();
	registerDefaultRules();
});

test("StepdownRule.analyze reports caller-before-callee pairs", () => {
	const { ctx } = parseRuleContext(getViolationFixture("stepdown"));
	const violations = stepdownRule.analyze(ctx);
	expect(violations.length).toBeGreaterThan(0);
	expect(violations.every((v) => v.kind === "stepdown")).toBe(true);
	const pairs = violations
		.filter((v) => v.kind === "stepdown")
		.map((v) => `${v.function.name}->${v.dependency.name}`);
	expect(pairs.length).toBeGreaterThan(0);
});

test("StepdownRule.fix reduces stepdown violations", () => {
	const fixture = getViolationFixture("stepdown");
	const { ctx } = parseRuleContext(fixture);
	const violations = stepdownRule.analyze(ctx);
	expect(violations.length).toBeGreaterThan(0);
	const fixed = stepdownRule.fix(ctx, violations);
	const after = stepdownRule.analyze(parseRuleContext(fixed).ctx);
	expect(after.length).toBeLessThan(violations.length);
});

test("stepdownRule.fix with empty violations returns unchanged content", () => {
	const fixture = getViolationFixture("stepdown");
	const { ctx } = parseRuleContext(fixture);
	expect(stepdownRule.analyze(ctx).length).toBeGreaterThan(0);
	expect(stepdownRule.fix(ctx, [])).toBe(ctx.parsedFile.content);
});

test("NestedRule.analyze reports nested name and parent", () => {
	const { ctx } = parseRuleContext(getViolationFixture("nested"));
	const violations = nestedRule.analyze(ctx);
	expect(violations.length).toBeGreaterThan(0);
	const v = violations[0];
	expect(v?.kind).toBe("nested");
	if (v?.kind === "nested") {
		expect(v.nested.name.length).toBeGreaterThan(0);
		expect(v.parent.name.length).toBeGreaterThan(0);
		expect(v.message).toContain("should appear after all logic");
	}
});

test("nestedRule.fix with empty violations is no-op", () => {
	const fixture = getViolationFixture("nested");
	const { ctx } = parseRuleContext(fixture);
	expect(nestedRule.analyze(ctx).length).toBeGreaterThan(0);
	expect(nestedRule.fix(ctx, [])).toBe(fixture);
});

test("nestedRule.fix alone reduces nested violations", () => {
	const fixture = getViolationFixture("nested");
	const { ctx } = parseRuleContext(fixture);
	const before = nestedRule.analyze(ctx);
	expect(before.length).toBeGreaterThan(0);
	const fixed = nestedRule.fix(ctx, before);
	const after = nestedRule.analyze(parseRuleContext(fixed).ctx);
	expect(after.length).toBeLessThan(before.length);
});

test("both default rules fix nested fixture to fewer total violations", () => {
	const fixture = getViolationFixture("nested");
	const { ctx } = parseRuleContext(fixture);
	const baseline = stepdownRule.analyze(ctx).length + nestedRule.analyze(ctx).length;
	expect(baseline).toBeGreaterThan(0);
	const { after, result } = fixCode(fixture);
	expect(result.errors).toHaveLength(0);
	expect(totalViolations(after)).toBeLessThan(baseline);
});
