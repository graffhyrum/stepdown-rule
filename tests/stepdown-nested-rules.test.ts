import { expect, test } from "bun:test";
import { buildRuleContext } from "../src/analyzer";
import { nestedRule } from "../src/nested-rule";
import { FileService } from "../src/services/FileService";
import { stepdownRule } from "../src/stepdown-rule";
import { getViolationFixture } from "../src/violation-coverage";

test("87w: StepdownRule.analyze matches current behavior", () => {
	const fixture = getViolationFixture("stepdown");
	const service = new FileService();
	const parsedFile = service.parseContent(fixture, "test.ts");
	const ctx = buildRuleContext(parsedFile);
	const violations = stepdownRule.analyze(ctx);
	expect(violations.length).toBeGreaterThan(0);
});

test("87w: StepdownRule.fix reduces violations", () => {
	const fixture = getViolationFixture("stepdown");
	const service = new FileService();
	const parsedFile = service.parseContent(fixture, "test.ts");
	const ctx = buildRuleContext(parsedFile);
	const violations = stepdownRule.analyze(ctx);
	expect(violations.length).toBeGreaterThan(0);
	const fixed = stepdownRule.fix(ctx, violations);
	const parsedAfter = service.parseContent(fixed, "test.ts");
	const ctxAfter = buildRuleContext(parsedAfter);
	const afterViolations = stepdownRule.analyze(ctxAfter);
	expect(afterViolations.length).toBeLessThan(violations.length);
});

test("vld: NestedRule.analyze matches current behavior", () => {
	const fixture = getViolationFixture("nested");
	const service = new FileService();
	const parsedFile = service.parseContent(fixture, "test.ts");
	const ctx = buildRuleContext(parsedFile);
	const violations = nestedRule.analyze(ctx);
	expect(violations.length).toBeGreaterThan(0);
});

test("vld: NestedRule.fix runs; stepdown then nested chain reduces violations", () => {
	const fixture = getViolationFixture("nested");
	const service = new FileService();
	let content = fixture;
	let parsedFile = service.parseContent(content, "test.ts");
	let ctx = buildRuleContext(parsedFile);
	const stepdownV = stepdownRule.analyze(ctx);
	const nestedV = nestedRule.analyze(ctx);
	expect(stepdownV.length + nestedV.length).toBeGreaterThan(0);
	content = stepdownRule.fix(ctx, stepdownV);
	parsedFile = service.parseContent(content, "test.ts");
	ctx = buildRuleContext(parsedFile);
	content = nestedRule.fix(ctx, nestedRule.analyze(ctx));
	parsedFile = service.parseContent(content, "test.ts");
	ctx = buildRuleContext(parsedFile);
	const afterStepdown = stepdownRule.analyze(ctx).length;
	const afterNested = nestedRule.analyze(ctx).length;
	expect(afterStepdown + afterNested).toBeLessThan(stepdownV.length + nestedV.length);
});
