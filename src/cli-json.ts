import type { AnalysisResult } from "./types";
export type JsonAnalysisResult = Omit<AnalysisResult, "dependencyGraph"> & {
	dependencyGraph?: Record<string, string[]>;
};
export function sanitizeForJson(
	results: AnalysisResult[],
	includeGraph = true,
): JsonAnalysisResult[] {
	return results.map((r) => ({
		...r,
		dependencyGraph: includeGraph ? dependencyGraphToRecord(r.dependencyGraph) : undefined,
		violations: r.violations.map((v) => ({
			kind: v.kind,
			file: r.file,
			function: {
				...v.function,
				parentFunction: stripAnonymousScope(v.function.parentFunction),
			},
			dependency: {
				...v.dependency,
				parentFunction: stripAnonymousScope(v.dependency.parentFunction),
			},
			message: v.message,
			callSite: v.callSite,
		})),
		nestedFunctionViolations: r.nestedFunctionViolations.map((v) => ({
			kind: v.kind,
			file: r.file,
			parent: {
				...v.parent,
				parentFunction: stripAnonymousScope(v.parent.parentFunction),
			},
			nested: {
				...v.nested,
				parentFunction: stripAnonymousScope(v.nested.parentFunction),
			},
			message: v.message,
		})),
	}));
}
function dependencyGraphToRecord(graph: Map<string, string[]>): Record<string, string[]> {
	return Object.fromEntries(graph.entries());
}
function stripAnonymousScope(parentFunction: string | null): string | null {
	if (parentFunction?.includes("<anonymous>")) return null;
	return parentFunction;
}
