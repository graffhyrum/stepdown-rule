import ts from "typescript";
import { isFunctionLike } from "./ast-utils";
import type { CallSite, FunctionInfo } from "./types";

/**
 * Unified module for building AST-based graphs and extracting structural information.
 * Consolidates logic from analyzer.ts and fixer.ts to avoid duplication.
 */

export interface CallSiteInfo {
	calledFunction: string;
	callSite: CallSite;
}

export interface FunctionNameMap {
	functionNames: Map<string, ts.Node>;
	dependencies: Map<string, string[]>;
}

export interface CallGraph {
	callGraph: Map<string, CallSiteInfo[]>;
	functionNames: Set<string>;
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

interface CallGraphContext {
	callGraph: Map<string, CallSiteInfo[]>;
	functionNames: Set<string>;
	sourceFile: ts.SourceFile;
}

/**
 * Build a call graph from functions.
 * Maps each function to the functions it calls (with location info).
 */
export function buildCallGraph(
	functions: FunctionInfo[],
	sourceFile: ts.SourceFile,
): Map<string, CallSiteInfo[]> {
	const callGraph = new Map<string, CallSiteInfo[]>();
	const functionNames = new Set(functions.map((f) => f.name));

	// Initialize empty dependency lists
	for (const func of functions) {
		callGraph.set(func.name, []);
	}

	// Visit tree to find calls
	const context: CallGraphContext = { callGraph, functionNames, sourceFile };
	visitSourceForCalls(sourceFile, context);

	return callGraph;
}

/**
 * Visitor that extracts call sites for functions.
 */
function visitSourceForCalls(node: ts.Node, context: CallGraphContext): void {
	if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
		recordCallSiteIfRelevant(node, context);
	}
	ts.forEachChild(node, (child) => visitSourceForCalls(child, context));
}

/**
 * Record a call site if it matches a known function.
 */
function recordCallSiteIfRelevant(node: ts.CallExpression, context: CallGraphContext): void {
	const calledFunction = (node.expression as ts.Identifier).getText(context.sourceFile);
	if (!context.functionNames.has(calledFunction)) {
		return;
	}
	const container = findContainingFunction(node, context.sourceFile);
	if (!container) {
		return;
	}
	const callSites = context.callGraph.get(container);
	if (callSites) {
		callSites.push({
			calledFunction,
			callSite: { line: 0, column: 0 }, // placeholder, set by caller if needed
		});
	}
}

/**
 * Find the name of the function that directly contains a node.
 */
export function findContainingFunction(node: ts.Node, sourceFile: ts.SourceFile): string | null {
	let current: ts.Node | undefined = node.parent;
	while (current) {
		if (ts.isFunctionDeclaration(current) && current.name) {
			return current.name.getText(sourceFile);
		}

		const variableDeclarationName = checkVariableDeclaration(current, node, sourceFile);
		if (variableDeclarationName !== null) {
			return variableDeclarationName;
		}

		current = current.parent;
	}
	return null;
}

/**
 * Check if current node is a variable declaration containing a function that contains the target node.
 */
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

/**
 * Convert call graph to a simple dependency map (function -> list of called functions).
 */
export function callGraphToDependencyMap(
	callGraph: Map<string, CallSiteInfo[]>,
): Map<string, string[]> {
	const map = new Map<string, string[]>();
	for (const [caller, deps] of callGraph) {
		map.set(caller, [...new Set(deps.map((d) => d.calledFunction))]);
	}
	return map;
}
