import type { RuleContext, Violation } from "./rule-context";
import { reorderTopLevelOnly } from "./stepdown-top-level-reorder";
import { findStepdownViolations } from "./stepdown-violation-detector";

export const stepdownRule = {
	id: "stepdown",
	analyze(ctx: RuleContext): Violation[] {
		return findStepdownViolations(ctx);
	},
	fix(ctx: RuleContext, violations: Violation[]): string {
		if (violations.length === 0) {
			return ctx.parsedFile.content;
		}
		return reorderTopLevelOnly(ctx.parsedFile.sourceFile, ctx.dependencyGraph);
	},
};
