import ts from "typescript";
import { buildCallGraph, callGraphToDependencyMap } from "./ast-graph-builder";
import { getPosition, isFunctionLike } from "./ast-utils";
import { detectCircularDependencies as detectCycles } from "./graph-algorithms";
import { findNestedFunctionViolations } from "./nested-violation-detector";
import { Pipeline } from "./pipeline";
import type { RuleRegistry } from "./registry";
import type { CallSiteInfo, RuleContext, Violation } from "./rule-context";
import { FileService } from "./services/FileService";
import type { IFileService, ParsedFile } from "./services/types";
import { findStepdownViolations } from "./stepdown-violation-detector";
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
		config: { ...config, fix: false },
		fileService: service,
		registry,
		mode: "analyze",
		resolvedFiles,
	});
	return analysisResults;
}
export function analyzeParsedFile(parsedFile: ParsedFile): AnalysisResult {
	const ctx = buildRuleContext(parsedFile);
	const nestedFunctionViolations = findNestedFunctionViolations(
		ctx.parsedFile.sourceFile,
		ctx.functions,
	);
	const circularDependencies = detectCircularDependencies(ctx.functions, ctx.callGraph);
	return {
		file: ctx.parsedFile.filePath,
		violations: findStepdownViolations(ctx),
		nestedFunctionViolations,
		circularDependencies,
		totalFunctions: ctx.functions.length,
		dependencyGraph: ctx.dependencyGraph,
	};
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
function extractFunctions(sourceFile: ts.SourceFile): FunctionInfo[] {
	const functions: FunctionInfo[] = [];
	visitForFunctionExtraction(sourceFile, null);
	return functions;
	function visitForFunctionExtraction(node: ts.Node, parentFunction: string | null) {
		if (ts.isFunctionDeclaration(node) && node.name) {
			const funcName = node.name.getText(sourceFile);
			handleFunctionDeclaration({ name: node.name, node, sourceFile, functions, parentFunction });
			ts.forEachChild(node, (child) => visitForFunctionExtraction(child, funcName));
			return;
		}
		if (ts.isVariableStatement(node)) {
			const context: VariableStatementContext = {
				sourceFile,
				functions,
				parentFunction,
			};
			const funcName = handleVariableStatement(node, context);
			if (funcName) {
				// Continue traversing with this function as the parent
				ts.forEachChild(node, (child) => visitForFunctionExtraction(child, funcName));
				return;
			}
		}
		const anonymousScope = getAnonymousScopeName(node, parentFunction);
		if (anonymousScope) {
			ts.forEachChild(node, (child) => visitForFunctionExtraction(child, anonymousScope));
			return;
		}
		ts.forEachChild(node, (child) => visitForFunctionExtraction(child, parentFunction));
	}
}
// Arrow/function-expression containers (e.g., describe/test callbacks) create a new scope.
// Returns null if the node is not an anonymous scope container.
function getAnonymousScopeName(node: ts.Node, parentFunction: string | null): string | null {
	// Guard: skip arrow functions whose parent is a VariableDeclaration (already handled by caller)
	if (!isFunctionLike(node)) return null;
	if (node.parent && ts.isVariableDeclaration(node.parent)) return null;
	return parentFunction ? `${parentFunction}.<anonymous>` : "<anonymous>";
}
function handleVariableStatement(
	node: ts.VariableStatement,
	context: VariableStatementContext,
): string | null {
	const { declarationList } = node;
	let firstFuncName: string | null = null;
	for (const declaration of declarationList.declarations) {
		const funcName = extractVariableFunction(declaration, node, context);
		if (funcName && !firstFuncName) {
			firstFuncName = funcName;
		}
	}
	return firstFuncName;
}
function extractVariableFunction(
	declaration: ts.VariableDeclaration,
	node: ts.VariableStatement,
	context: VariableStatementContext,
): string | null {
	if (!(declaration.initializer && isFunctionLike(declaration.initializer))) {
		return null;
	}
	const functionInfo = createVariableFunctionInfo(declaration, node, context);
	if (!functionInfo) {
		return null;
	}
	context.functions.push(functionInfo);
	return functionInfo.name;
}
function createVariableFunctionInfo(
	declaration: ts.VariableDeclaration,
	node: ts.VariableStatement,
	context: VariableStatementContext,
): FunctionInfo | null {
	const name = declaration.name?.getText(context.sourceFile);
	if (!(name && declaration.initializer)) {
		return null;
	}
	const pos = getPosition(context.sourceFile, node);
	return {
		name,
		kind: ts.isArrowFunction(declaration.initializer) ? "arrow-function" : "function-expression",
		position: {
			...pos,
			start: node.getStart(),
			end: node.getEnd(),
		},
		isExported: hasExportModifier(node),
		parentFunction: context.parentFunction,
	};
}
function handleFunctionDeclaration({
	name,
	node,
	sourceFile,
	functions,
	parentFunction,
}: {
	name: ts.Identifier;
	node: ts.FunctionDeclaration;
	sourceFile: ts.SourceFile;
	functions: FunctionInfo[];
	parentFunction: string | null;
}): void {
	const pos = getPosition(sourceFile, node);
	const functionInfo: FunctionInfo = {
		name: name.getText(sourceFile),
		kind: "declaration",
		position: {
			...pos,
			start: node.getStart(),
			end: node.getEnd(),
		},
		isExported: hasExportModifier(node),
		parentFunction,
	};
	functions.push(functionInfo);
}
function isStepdownViolation(v: Violation): v is StepdownViolation {
	return v.kind === "stepdown";
}
function hasExportModifier(node: ts.Node): boolean {
	if (!ts.canHaveModifiers(node)) {
		return false;
	}
	const modifiers = ts.getModifiers(node);
	return !!modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
}
interface VariableStatementContext {
	sourceFile: ts.SourceFile;
	functions: FunctionInfo[];
	parentFunction: string | null;
}
