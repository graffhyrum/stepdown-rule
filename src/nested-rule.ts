import { applyNestedOnly } from "./nested-block-transform";
import { findNestedViolations } from "./nested-violation-detector";
import type { RuleContext, Violation, ViolationRule } from "./rule-context";

/**
 * Nested function-before-logic ViolationRule.
 * Detect → nested-violation-detector; transform → nested-block-transform (shared BlockOrderModel).
 * Contract: fix(ctx, []) returns parsed content unchanged (no-op).
 */
export const nestedRule: ViolationRule = {
	id: "nested",
	analyze(ctx: RuleContext): Violation[] {
		return findNestedViolations(ctx);
	},
	fix(ctx: RuleContext, violations: Violation[]): string {
		if (violations.length === 0) {
			return ctx.parsedFile.content;
		}
		return applyNestedOnly(ctx.parsedFile.sourceFile);
	},
};
