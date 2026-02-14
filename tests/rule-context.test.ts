import { expect, test } from "bun:test";
import ts from "typescript";
import type { RuleContext, Violation, ViolationRule } from "../src/rule-context";
import type { ParsedFile } from "../src/services/types";

function buildMinimalRuleContext(content: string, filePath = "test.ts"): RuleContext {
	const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);
	const parsedFile: ParsedFile = { sourceFile, filePath, content };
	return {
		parsedFile,
		functions: [],
		callGraph: new Map(),
		dependencyGraph: new Map(),
	};
}

const stubRule: ViolationRule = {
	id: "stub",
	analyze(_ctx: RuleContext): Violation[] {
		return [];
	},
	fix(ctx: RuleContext, _violations: Violation[]): string {
		return ctx.parsedFile.content;
	},
};

test("RuleContext and ViolationRule: stub rule analyze returns empty violations", () => {
	const content = "function a() { return 1; }";
	const ctx = buildMinimalRuleContext(content);
	const violations = stubRule.analyze(ctx);
	expect(violations).toEqual([]);
});

test("RuleContext and ViolationRule: stub rule fix returns content unchanged", () => {
	const content = "function a() { return 1; }";
	const ctx = buildMinimalRuleContext(content);
	const result = stubRule.fix(ctx, []);
	expect(result).toBe(content);
});
