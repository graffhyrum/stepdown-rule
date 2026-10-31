import { applyNestedOnly } from "./nested-block-transform";
import { findNestedViolations } from "./nested-violation-detector";
import type { RuleContext, Violation, ViolationRule } from "./rule-context";

/**
 * Nested function-before-logic rule.
 * Analyze via nested-violation-detector; transform via nested-block-transform.
 */
export const nestedRule: ViolationRule = {
	id: "nested",
	analyze(ctx: RuleContext): Violation[] {
		return findNestedViolations(ctx);
	},
	fix(ctx: RuleContext): string {
		if (findNestedViolations(ctx).length === 0) {
			return ctx.parsedFile.content;
		}
		return applyNestedOnly(ctx.parsedFile.sourceFile);
	},
};
