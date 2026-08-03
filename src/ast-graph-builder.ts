import ts from "typescript";
import type { FunctionNode } from "./ast-node-visitors";
import { getPosition, isFunctionLike } from "./ast-utils";
import type { CallSiteInfo } from "./rule-context";
import type { FunctionInfo } from "./types";
export interface FunctionNameMap {
	functionNames: Map<string, ts.Node>;
	dependencies: Map<string, string[]>;
}
/**
 * Extract all function dependencies from a node by visiting its children.
 */
export function extractDependenciesFor(
	node: ts.Node,
	sourceFile: ts.SourceFile,
	functionNames: Map<string, ts.Node>,
): string[] {
	const known = new Set(functionNames.keys());
	const dependencies: string[] = [];
	forEachCallExpression(node, sourceFile, (calledName) => {
		if (known.has(calledName)) {
			dependencies.push(calledName);
		}
	});
	return [...new Set(dependencies)];
}
/**
 * Build a dependency graph from a list of function nodes.
 * Returns mapping of function names to their dependencies and node references.
 */
export function buildDependencyGraph(
	functions: FunctionNode[],
	sourceFile: ts.SourceFile,
): FunctionNameMap {
	const functionNames = new Map<string, ts.Node>();
	for (const { node } of functions) {
		const name = extractFunctionName(node, sourceFile);
		if (name) functionNames.set(name, node);
	}
	const callGraph = buildCallGraph(new Set(functionNames.keys()), sourceFile);
	return { functionNames, dependencies: callGraphToDependencyMap(callGraph) };
}
/**
 * Build a call graph with call-site positions for every known function.
 * Single production CallExpression walker for dependency/call-graph construction.
 */
export function buildCallGraph(
	functionNames: Set<string>,
	sourceFile: ts.SourceFile,
): Map<string, CallSiteInfo[]> {
	const callGraph = new Map<string, CallSiteInfo[]>();
	for (const name of functionNames) {
		callGraph.set(name, []);
	}
	forEachCallExpression(sourceFile, sourceFile, (calledFunction, callNode) => {
		if (!functionNames.has(calledFunction)) {
			return;
		}
		const container = findContainingFunction(callNode, sourceFile, functionNames);
		if (!container) {
			return;
		}
		const deps = callGraph.get(container);
		if (!deps) {
			return;
		}
		const { line, column } = getPosition(sourceFile, callNode);
		deps.push({ calledFunction, callSite: { line, column } });
	});
	return callGraph;
}
function findContainingFunction(
	node: ts.Node,
	sourceFile: ts.SourceFile,
	knownNames: Set<string>,
): string | null {
	let current: ts.Node | undefined = node.parent;
	while (current) {
		if (ts.isFunctionDeclaration(current) && current.name) {
			const name = current.name.getText(sourceFile);
			if (knownNames.has(name)) {
				return name;
			}
		}
		const variableDeclarationName = checkVariableDeclaration(current, node, sourceFile);
		if (variableDeclarationName !== null && knownNames.has(variableDeclarationName)) {
			return variableDeclarationName;
		}
		current = current.parent;
	}
	return null;
}
function forEachCallExpression(
	root: ts.Node,
	sourceFile: ts.SourceFile,
	callback: (calledName: string, callNode: ts.CallExpression) => void,
): void {
	const visit = (node: ts.Node): void => {
		if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
			callback(node.expression.getText(sourceFile), node);
		}
		ts.forEachChild(node, visit);
	};
	visit(root);
}
/**
 * Extract all function names from a list of function info objects.
 * Used by both fixer and analyzer to get a set of defined functions.
 */
export function extractFunctionNames(functions: FunctionInfo[]): Set<string> {
	return new Set(functions.map((f) => f.name));
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
/**
 * Convert call graph to a simple dependency map (function -> list of called functions).
 */
export function callGraphToDependencyMap(
	callGraph: Map<
		string,
		Array<{
			calledFunction: string;
		}>
	>,
): Map<string, string[]> {
	const map = new Map<string, string[]>();
	for (const [caller, deps] of callGraph) {
		map.set(caller, [...new Set(deps.map((d) => d.calledFunction))]);
	}
	return map;
}
function checkVariableDeclaration(
	current: ts.Node,
	node: ts.Node,
	sourceFile: ts.SourceFile,
): string | null {
	if (!ts.isVariableStatement(current)) {
		return null;
	}
	for (const declaration of current.declarationList.declarations) {
		if (declaration.initializer && isFunctionLike(declaration.initializer)) {
			const funcStart = declaration.initializer.getStart();
			const funcEnd = declaration.initializer.getEnd();
			const nodeStart = node.getStart();
			if (nodeStart >= funcStart && nodeStart <= funcEnd) {
				return declaration.name?.getText(sourceFile) || null;
			}
		}
	}
	return null;
}
