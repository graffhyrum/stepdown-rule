import type { ParsedFile } from "./services/types";
import type { CallSite, FunctionInfo, NestedFunctionViolation, StepdownViolation } from "./types";

export type Violation = StepdownViolation | NestedFunctionViolation;

export interface CallSiteInfo {
	calledFunction: string;
	callSite: CallSite;
}

export interface RuleContext {
	parsedFile: ParsedFile;
	functions: FunctionInfo[];
	callGraph: Map<string, CallSiteInfo[]>;
	dependencyGraph: Map<string, string[]>;
}

export interface ViolationRule {
	id: string;
	analyze(ctx: RuleContext): Violation[];
	fix(ctx: RuleContext, violations: Violation[]): string;
}
