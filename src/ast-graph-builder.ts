import ts from "typescript";
import type { FunctionInfo } from "./types";

export interface FunctionNameMap {
	functionNames: Map<string, ts.Node>;
	dependencies: Map<string, string[]>;
}

/**
 * Extract all function names from a list of function info objects.
 * Used by both fixer and analyzer to get a set of defined functions.
 */
export function extractFunctionNames(functions: FunctionInfo[]): Set<string> {
	return new Set(functions.map((f) => f.name));
}

/**
 * Build a dependency graph from a list of function nodes.
 * Returns mapping of function names to their dependencies and node references.
 */
export function buildDependencyGraph(
	functions: Array<{ node: ts.Node; info: null }>,
	sourceFile: ts.SourceFile,
): FunctionNameMap {
	const functionNames = new Map<string, ts.Node>();
	const dependencies = new Map<string, string[]>();

	// First pass: collect all function names
	for (const { node } of functions) {
		const name = extractFunctionName(node, sourceFile);
		if (name) functionNames.set(name, node);
	}

	// Second pass: extract dependencies for each function
	for (const { node } of functions) {
		const name = extractFunctionName(node, sourceFile);
		if (name) {
			const deps = extractDependenciesFor(node, sourceFile, functionNames);
			dependencies.set(name, deps);
		}
	}

	return { functionNames, dependencies };
}

/**
 * Extract function name from a TypeScript node.
 * Handles FunctionDeclarations and VariableStatements with function initializers.
 */
export function extractFunctionName(node: ts.Node, sourceFile: ts.SourceFile): string | null {
	if (ts.isFunctionDeclaration(node) && node.name) {
		return node.name.getText(sourceFile);
	}

	if (ts.isVariableStatement(node)) {
		const [declaration] = node.declarationList.declarations;
		if (declaration?.name && ts.isIdentifier(declaration.name)) {
			return declaration.name.getText(sourceFile);
		}
	}

	return null;
}

interface DependencyExtractionContext {
	sourceFile: ts.SourceFile;
	functionNames: Map<string, ts.Node>;
	dependencies: string[];
}

/**
 * Extract all function dependencies from a node by visiting its children.
 */
export function extractDependenciesFor(
	node: ts.Node,
	sourceFile: ts.SourceFile,
	functionNames: Map<string, ts.Node>,
): string[] {
	const context: DependencyExtractionContext = { sourceFile, functionNames, dependencies: [] };
	visitNodeForDependencies(node, context);
	return [...new Set(context.dependencies)]; // deduplicate
}

/**
 * Visitor that collects function call dependencies.
 */
function visitNodeForDependencies(node: ts.Node, context: DependencyExtractionContext): void {
	if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
		const calledName = node.expression.getText(context.sourceFile);
		if (context.functionNames.has(calledName)) {
			context.dependencies.push(calledName);
		}
	}
	ts.forEachChild(node, (child) => visitNodeForDependencies(child, context));
}

/**
 * Convert call graph to a simple dependency map (function -> list of called functions).
 */
export function callGraphToDependencyMap(
	callGraph: Map<string, Array<{ calledFunction: string }>>,
): Map<string, string[]> {
	const map = new Map<string, string[]>();
	for (const [caller, deps] of callGraph) {
		map.set(caller, [...new Set(deps.map((d) => d.calledFunction))]);
	}
	return map;
}
