import { findStepdownViolations } from "./analyzer";
import { reorderTopLevelOnly } from "./fixer";
import type { RuleContext, Violation } from "./rule-context";

export const stepdownRule = {
	id: "stepdown",
	analyze(ctx: RuleContext): Violation[] {
		return findStepdownViolations(ctx);
	},
	fix(ctx: RuleContext, _violations: Violation[]): string {
		return reorderTopLevelOnly(ctx.parsedFile.sourceFile, ctx.dependencyGraph);
	},
};
