import { buildCallGraph, callGraphToDependencyMap } from "./ast-graph-builder";
import { extractFunctions } from "./function-extraction";
import { detectCircularDependencies as detectCycles } from "./graph-algorithms";

import { Pipeline } from "./pipeline";
import type { RuleRegistry } from "./registry";
import type { CallSiteInfo, RuleContext, Violation } from "./rule-context";
import { FileService } from "./services/FileService";
import type { IFileService, ParsedFile } from "./services/types";

import type {
	AnalysisResult,
	Config,
	FunctionInfo,
	NestedFunctionViolation,
	StepdownViolation,
} from "./types";

export { findStepdownViolations } from "./stepdown-violation-detector";

/** Thin facade over {@link Pipeline.run} (mode: analyze). */
export async function analyzeFiles(
	patterns: string[],
	config: Config,
	fileService?: IFileService,
	resolvedFiles?: string[],
	registry?: RuleRegistry,
): Promise<AnalysisResult[]> {
	const service = fileService ?? new FileService({ ignore: config.ignore });
	const { analysisResults } = await Pipeline.run({
		patterns,
		config,
		fileService: service,
		registry,
		mode: "analyze",
		resolvedFiles,
	});
	return analysisResults;
}
export function analyzeWithRules(
	parsedFile: ParsedFile,
	enabledRules: {
		analyze(ctx: RuleContext): Violation[];
	}[],
): AnalysisResult {
	const ctx = buildRuleContext(parsedFile);
	const allViolations: Violation[] = [];
	for (const rule of enabledRules) {
		allViolations.push(...rule.analyze(ctx));
	}
	return violationsToAnalysisResult(ctx, allViolations);
}
function violationsToAnalysisResult(ctx: RuleContext, violations: Violation[]): AnalysisResult {
	const stepdownViolations = violations.filter(isStepdownViolation);
	const nestedFunctionViolations = violations.filter(
		(v): v is NestedFunctionViolation => v.kind === "nested",
	);
	const circularDependencies = detectCircularDependencies(ctx.functions, ctx.callGraph);
	return {
		file: ctx.parsedFile.filePath,
		violations: stepdownViolations,
		nestedFunctionViolations,
		circularDependencies,
		totalFunctions: ctx.functions.length,
		dependencyGraph: ctx.dependencyGraph,
	};
}
function detectCircularDependencies(
	functions: FunctionInfo[],
	callGraph: Map<string, CallSiteInfo[]>,
): string[][] {
	const names = new Set(functions.map((f) => f.name));
	return detectCycles(callGraph, names);
}
export function buildRuleContext(parsedFile: ParsedFile): RuleContext {
	const { sourceFile } = parsedFile;
	const functions = extractFunctions(sourceFile);
	const callGraph = buildCallGraph(new Set(functions.map((f) => f.name)), sourceFile);
	const dependencyGraph = callGraphToDependencyMap(callGraph);
	return {
		parsedFile,
		functions,
		callGraph,
		dependencyGraph,
	};
}
function isStepdownViolation(v: Violation): v is StepdownViolation {
	return v.kind === "stepdown";
}
