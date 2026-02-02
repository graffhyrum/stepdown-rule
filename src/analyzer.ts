import { readFileSync } from "node:fs";
import { glob } from "glob";
import ts from "typescript";
import type { AnalysisResult, Config, FunctionInfo, StepdownViolation } from "./types";

export async function analyzeFiles(patterns: string[], config: Config): Promise<AnalysisResult[]> {
	const files = await resolveFiles(patterns, config.ignore);
	const results: AnalysisResult[] = [];

	for (const file of files) {
		const result = analyzeFile(file);
		results.push(result);
	}

	return results;
}

async function resolveFiles(patterns: string[], ignorePatterns: string[]): Promise<string[]> {
	const allFiles: string[] = [];

	for (const pattern of patterns) {
		const matches = await glob(pattern, {
			ignore: ["node_modules/**", "dist/**", "coverage/**", "*.d.ts", ...ignorePatterns],
		});
		allFiles.push(...matches);
	}

	return [...new Set(allFiles)].sort();
}

function analyzeFile(filePath: string): AnalysisResult {
	const sourceCode = readFileSync(filePath, "utf-8");
	const sourceFile = ts.createSourceFile(filePath, sourceCode, ts.ScriptTarget.Latest, true);

	const functions = extractFunctions(sourceFile);
	const callGraph = buildCallGraph(functions, sourceFile);
	const violations = findViolations(functions, callGraph);
	const circularDependencies = detectCircularDependencies(functions, callGraph);

	return {
		file: filePath,
		violations,
		circularDependencies,
		totalFunctions: functions.length,
	};
}

function extractFunctions(sourceFile: ts.SourceFile): FunctionInfo[] {
	const functions: FunctionInfo[] = [];

	function visit(node: ts.Node) {
		if (ts.isFunctionDeclaration(node) && node.name) {
			handleFunctionDeclaration({ name: node.name, node, sourceFile, functions });
		} else if (ts.isVariableStatement(node) && !hasExportModifier(node)) {
			handleVariableStatement(node, sourceFile, functions);
		}

		ts.forEachChild(node, visit);
	}

	visit(sourceFile);
	return functions;
}

function handleFunctionDeclaration({
	name,
	node,
	sourceFile,
	functions,
}: {
	name: ts.Identifier;
	node: ts.FunctionDeclaration;
	sourceFile: ts.SourceFile;
	functions: FunctionInfo[];
}): void {
	const functionInfo: FunctionInfo = {
		name: name.getText(sourceFile),
		kind: "declaration",
		position: {
			line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
			column: sourceFile.getLineAndCharacterOfPosition(node.getStart()).character + 1,
			start: node.getStart(),
			end: node.getEnd(),
		},
		isExported: hasExportModifier(node),
		dependencies: [],
		canBeFunctionDeclaration: true,
	};
	functions.push(functionInfo);
}

function handleVariableStatement(
	node: ts.VariableStatement,
	sourceFile: ts.SourceFile,
	functions: FunctionInfo[],
): void {
	const { declarationList } = node;
	for (const declaration of declarationList.declarations) {
		if (declaration.initializer && isArrowFunctionOrFunctionExpression(declaration.initializer)) {
			const functionInfo = createVariableFunctionInfo(declaration, sourceFile, node);
			if (functionInfo) {
				functions.push(functionInfo);
			}
		}
	}
}

function createVariableFunctionInfo(
	declaration: ts.VariableDeclaration,
	sourceFile: ts.SourceFile,
	node: ts.VariableStatement,
): FunctionInfo | null {
	const name = declaration.name?.getText(sourceFile);
	if (!(name && declaration.initializer)) {
		return null;
	}

	const functionInfo: FunctionInfo = {
		name,
		kind: ts.isArrowFunction(declaration.initializer) ? "arrow-function" : "function-expression",
		position: {
			line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
			column: sourceFile.getLineAndCharacterOfPosition(node.getStart()).character + 1,
			start: node.getStart(),
			end: node.getEnd(),
		},
		isExported: false,
		dependencies: [],
		canBeFunctionDeclaration: isArrowFunctionOrFunctionExpression(declaration.initializer)
			? canConvertToFunctionDeclaration(
					declaration.initializer as ts.FunctionLikeDeclaration,
					sourceFile,
				)
			: false,
	};
	return functionInfo;
}

function hasExportModifier(node: ts.Node): boolean {
	if (!ts.canHaveModifiers(node)) {
		return false;
	}
	const modifiers = ts.getModifiers(node);
	return !!modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
}

function isArrowFunctionOrFunctionExpression(node: ts.Node): boolean {
	return ts.isArrowFunction(node) || ts.isFunctionExpression(node);
}

function canConvertToFunctionDeclaration(
	node: ts.FunctionLikeDeclaration,
	sourceFile: ts.SourceFile,
): boolean {
	// Check for `this` usage
	if (!hasNoThisKeyword(node)) {
		return false;
	}

	// Check for closure over external variables
	const sourceFileFunctions = collectSourceFileFunctionNames(sourceFile);
	return hasNoExternalVariableReferences({ node, sourceFile, functionNames: sourceFileFunctions });
}

function hasNoThisKeyword(node: ts.Node): boolean {
	if (node.kind === ts.SyntaxKind.ThisKeyword) {
		return false;
	}
	for (const child of node.getChildren()) {
		if (!hasNoThisKeyword(child)) {
			return false;
		}
	}
	return true;
}

function collectSourceFileFunctionNames(sourceFile: ts.SourceFile): Set<string> {
	const functionNames = new Set<string>();

	function visit(node: ts.Node) {
		if (ts.isFunctionDeclaration(node) && node.name) {
			functionNames.add(node.name.getText(sourceFile));
		}
		ts.forEachChild(node, visit);
	}

	visit(sourceFile);
	return functionNames;
}

function hasNoExternalVariableReferences({
	node,
	sourceFile,
	functionNames,
	currentFunction,
}: {
	node: ts.Node;
	sourceFile: ts.SourceFile;
	functionNames: Set<string>;
	currentFunction?: ts.FunctionLikeDeclaration;
}): boolean {
	if (node === currentFunction) {
		return true;
	}

	if (ts.isIdentifier(node) && !functionNames.has(node.getText(sourceFile))) {
		// This is a reference to an external variable - check if it's from closure scope
		const { parent } = node;
		if (parent && !ts.isPropertyAccessExpression(parent) && !ts.isElementAccessExpression(parent)) {
			return false; // External variable used in closure
		}
	}

	for (const child of node.getChildren()) {
		if (
			!hasNoExternalVariableReferences({ node: child, sourceFile, functionNames, currentFunction })
		) {
			return false;
		}
	}
	return true;
}

function buildCallGraph(
	functions: FunctionInfo[],
	sourceFile: ts.SourceFile,
): Map<string, string[]> {
	const callGraph = new Map<string, string[]>();
	const functionNames = new Set(functions.map((f) => f.name));

	for (const func of functions) {
		callGraph.set(func.name, []);
	}

	function recordDependency(calledFunction: string, container: string | null) {
		if (container) {
			const deps = callGraph.get(container);
			if (deps) {
				deps.push(calledFunction);
			}
		}
	}

	function visit(node: ts.Node) {
		if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
			const calledFunction = node.expression.getText(sourceFile);
			if (functionNames.has(calledFunction)) {
				const container = findContainingFunction(node, sourceFile);
				recordDependency(calledFunction, container);
			}
		}
		ts.forEachChild(node, visit);
	}

	visit(sourceFile);

	// Remove duplicates and sort
	for (const [func, deps] of callGraph) {
		callGraph.set(func, [...new Set(deps)]);
	}

	return callGraph;
}

function findContainingFunction(node: ts.Node, sourceFile: ts.SourceFile): string | null {
	let current: ts.Node | undefined = node.parent;

	while (current) {
		if (ts.isFunctionDeclaration(current) && current.name) {
			return current.name.getText(sourceFile);
		}
		const variableDeclarationName = checkVariableDeclaration(current, node, sourceFile);
		if (variableDeclarationName !== undefined) {
			return variableDeclarationName;
		}
		current = current.parent;
	}

	return null;
}

function checkVariableDeclaration(
	current: ts.Node,
	node: ts.Node,
	sourceFile: ts.SourceFile,
): string | null | undefined {
	if (!ts.isVariableStatement(current)) {
		return undefined;
	}

	for (const declaration of current.declarationList.declarations) {
		if (declaration.initializer && isArrowFunctionOrFunctionExpression(declaration.initializer)) {
			const funcStart = declaration.initializer.getStart();
			const funcEnd = declaration.initializer.getEnd();
			const nodeStart = node.getStart();

			if (nodeStart >= funcStart && nodeStart <= funcEnd) {
				return declaration.name?.getText(sourceFile) || null;
			}
		}
	}

	return undefined;
}

function findViolations(
	functions: FunctionInfo[],
	callGraph: Map<string, string[]>,
): StepdownViolation[] {
	const violations: StepdownViolation[] = [];

	for (const func of functions) {
		const dependencies = callGraph.get(func.name) || [];
		for (const depName of dependencies) {
			const depFunc = functions.find((f) => f.name === depName);
			if (depFunc && depFunc.position.line > func.position.line) {
				violations.push({
					file: "", // Will be set in analyzeFile
					function: func,
					dependency: depFunc,
					message: `Stepdown violation: ${func.name} calls ${depName} which appears later`,
				});
			}
		}
	}

	return violations;
}

function detectCircularDependencies(
	functions: FunctionInfo[],
	callGraph: Map<string, string[]>,
): string[][] {
	const cycles: string[][] = [];
	const visited = new Set<string>();
	const recursionStack = new Set<string>();
	const path: string[] = [];

	function dfs(funcName: string): boolean {
		if (recursionStack.has(funcName)) {
			const cycleStart = path.indexOf(funcName);
			cycles.push([...path.slice(cycleStart), funcName]);
			return true;
		}

		if (visited.has(funcName)) {
			return false;
		}

		visited.add(funcName);
		recursionStack.add(funcName);
		path.push(funcName);

		const dependencies = callGraph.get(funcName) || [];
		for (const dep of dependencies) {
			if (dfs(dep)) {
				return true;
			}
		}

		recursionStack.delete(funcName);
		path.pop();
		return false;
	}

	for (const func of functions) {
		if (!visited.has(func.name)) {
			dfs(func.name);
		}
	}

	return cycles;
}
