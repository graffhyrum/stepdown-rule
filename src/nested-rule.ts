import { findNestedViolations } from "./analyzer";
import { applyNestedOnly } from "./fixer";
import type { RuleContext, Violation } from "./rule-context";

export const nestedRule = {
	id: "nested",
	analyze(ctx: RuleContext): Violation[] {
		return findNestedViolations(ctx);
	},
	fix(ctx: RuleContext, _violations: Violation[]): string {
		return applyNestedOnly(ctx.parsedFile.sourceFile);
	},
};
