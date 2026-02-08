import { readFileSync } from "node:fs";
import { glob } from "glob";
import ts from "typescript";
import type {
	AnalysisResult,
	Config,
	FunctionInfo,
	NestedFunctionViolation,
	StepdownViolation,
} from "./types";

export async function analyzeFiles(patterns: string[], config: Config): Promise<AnalysisResult[]> {
	const files = await resolveFiles(patterns, config.ignore);
	const results: AnalysisResult[] = [];

	for (const file of files) {
		const result = analyzeFile(file);
		results.push(result);
	}

	return results;
}

function analyzeFile(filePath: string): AnalysisResult {
	const sourceCode = readFileSync(filePath, "utf-8");
	const sourceFile = ts.createSourceFile(filePath, sourceCode, ts.ScriptTarget.Latest, true);

	const functions = extractFunctions(sourceFile);
	const callGraph = buildCallGraph(functions, sourceFile);
	const violations = findViolations(functions, callGraph);
	const nestedFunctionViolations = findNestedFunctionViolations(sourceFile, functions);
	const circularDependencies = detectCircularDependencies(functions, callGraph);

	return {
		file: filePath,
		violations,
		nestedFunctionViolations,
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

function buildCallGraph(
	functions: FunctionInfo[],
	sourceFile: ts.SourceFile,
): Map<string, string[]> {
	const callGraph = new Map<string, string[]>();
	const functionNames = new Set(functions.map((f) => f.name));

	for (const func of functions) {
		callGraph.set(func.name, []);
	}

	visit(sourceFile);

	for (const [func, deps] of callGraph) {
		callGraph.set(func, [...new Set(deps)]);
	}

	return callGraph;

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

	function recordDependency(calledFunction: string, container: string | null) {
		if (container) {
			const deps = callGraph.get(container);
			if (deps) {
				deps.push(calledFunction);
			}
		}
	}
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
			if (depFunc && depFunc.position.line < func.position.line) {
				violations.push({
					file: "",
					function: func,
					dependency: depFunc,
					message: `Stepdown violation: ${func.name} calls ${depName} which appears above it`,
				});
			}
		}
	}

	return violations;
}

function findNestedFunctionViolations(
	sourceFile: ts.SourceFile,
	functions: FunctionInfo[],
): NestedFunctionViolation[] {
	const violations: NestedFunctionViolation[] = [];
	const functionMap = new Map(functions.map((f) => [f.name, f]));
	const context = { sourceFile, functionMap, violations };

	visit(sourceFile, context);
	return violations;
}

interface NestedViolationContext {
	sourceFile: ts.SourceFile;
	functionMap: Map<string, FunctionInfo>;
	violations: NestedFunctionViolation[];
}

function visit(node: ts.Node, context: NestedViolationContext): void {
	const { sourceFile, functionMap } = context;

	if (ts.isFunctionDeclaration(node) && node.name) {
		const funcInfo = functionMap.get(node.name.getText(sourceFile));
		if (funcInfo) {
			checkFunctionBody(node, funcInfo, context);
		}
	} else if (ts.isVariableStatement(node)) {
		processVariableStatement(node, context);
	}

	ts.forEachChild(node, (child) => visit(child, context));
}

function processVariableStatement(
	node: ts.VariableStatement,
	context: NestedViolationContext,
): void {
	const { sourceFile, functionMap } = context;

	for (const decl of node.declarationList.declarations) {
		const isValidArrowFunc =
			decl.initializer &&
			isArrowFunctionOrFunctionExpression(decl.initializer) &&
			decl.name &&
			ts.isIdentifier(decl.name);

		if (isValidArrowFunc && decl.name && decl.initializer) {
			const funcInfo = functionMap.get(decl.name.getText(sourceFile));
			if (funcInfo) {
				checkFunctionBody(decl.initializer as ts.FunctionLikeDeclaration, funcInfo, context);
			}
		}
	}
}

function checkFunctionBody(
	func: ts.FunctionLikeDeclaration,
	funcInfo: FunctionInfo,
	context: NestedViolationContext,
): void {
	const { sourceFile } = context;
	if (!(func.body && ts.isBlock(func.body))) {
		return;
	}

	const returnStmt = findReturnStatement(func.body, sourceFile);
	if (!returnStmt) {
		return;
	}

	const returnLine = sourceFile.getLineAndCharacterOfPosition(returnStmt.getStart()).line + 1;
	processStatements({
		statements: func.body.statements,
		parentInfo: funcInfo,
		returnLine,
		context,
	});
}

function findReturnStatement(node: ts.Node, sourceFile: ts.SourceFile): ts.ReturnStatement | null {
	if (ts.isReturnStatement(node)) {
		return node;
	}
	for (const child of node.getChildren(sourceFile)) {
		const result = findReturnStatement(child, sourceFile);
		if (result) {
			return result;
		}
	}
	return null;
}

interface StatementProcessContext {
	parentInfo: FunctionInfo;
	returnLine: number;
	context: NestedViolationContext;
}

function processStatements(
	params: StatementProcessContext & { statements: ts.NodeArray<ts.Statement> },
): void {
	const { statements, parentInfo, returnLine, context } = params;
	for (const statement of statements) {
		if (ts.isFunctionDeclaration(statement)) {
			processFunctionDeclaration({ statement, parentInfo, returnLine, context });
		} else if (ts.isVariableStatement(statement)) {
			processVariableDeclaration({ statement, parentInfo, returnLine, context });
		}
	}
}

interface FunctionDeclParams {
	statement: ts.FunctionDeclaration;
	parentInfo: FunctionInfo;
	returnLine: number;
	context: NestedViolationContext;
}

function processFunctionDeclaration(params: FunctionDeclParams): void {
	const { statement, parentInfo, returnLine, context } = params;
	const { sourceFile, functionMap, violations } = context;
	if (!statement.name) {
		return;
	}

	const nestedName = statement.name.getText(sourceFile);
	const nestedInfo = functionMap.get(nestedName);

	if (nestedInfo) {
		checkAndAddViolation({
			nodeStart: statement.getStart(),
			nestedName,
			nestedInfo,
			parentInfo,
			returnLine,
			violations,
			sourceFile,
		});
		checkFunctionBody(statement, nestedInfo, context);
	} else if (statement.body) {
		checkFunctionBody(statement, parentInfo, context);
	}
}

interface VariableDeclParams {
	statement: ts.VariableStatement;
	parentInfo: FunctionInfo;
	returnLine: number;
	context: NestedViolationContext;
}

function processVariableDeclaration(params: VariableDeclParams): void {
	const { statement, parentInfo, returnLine, context } = params;
	const { sourceFile, functionMap, violations } = context;

	for (const decl of statement.declarationList.declarations) {
		if (!(decl.initializer && isArrowFunctionOrFunctionExpression(decl.initializer))) {
			continue;
		}
		if (!(decl.name && ts.isIdentifier(decl.name))) {
			continue;
		}

		const nestedName = decl.name.getText(sourceFile);
		const nestedInfo = functionMap.get(nestedName);

		if (nestedInfo) {
			checkAndAddViolation({
				nodeStart: decl.initializer.getStart(),
				nestedName,
				nestedInfo,
				parentInfo,
				returnLine,
				violations,
				sourceFile,
			});
			checkFunctionBody(decl.initializer as ts.FunctionLikeDeclaration, nestedInfo, context);
		}
	}
}

interface ViolationCheckParams {
	nodeStart: number;
	nestedName: string;
	nestedInfo: FunctionInfo;
	parentInfo: FunctionInfo;
	returnLine: number;
	violations: NestedFunctionViolation[];
	sourceFile: ts.SourceFile;
}

function checkAndAddViolation(params: ViolationCheckParams): void {
	const { nodeStart, nestedName, nestedInfo, parentInfo, returnLine, violations, sourceFile } =
		params;
	const nestedLine = sourceFile.getLineAndCharacterOfPosition(nodeStart).line + 1;

	if (nestedLine < returnLine) {
		violations.push({
			file: "",
			parent: parentInfo,
			nested: nestedInfo,
			message: `Nested function violation: ${nestedName} should appear after return statement in ${parentInfo.name}`,
		});
	}
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

async function resolveFiles(patterns: string[], ignorePatterns: string[]): Promise<string[]> {
	const allFiles: string[] = [];

	for (const pattern of patterns) {
		const matches = await glob(pattern, {
			ignore: ["node_modules/**", "dist/**", "coverage/**", "*.d.ts", ...ignorePatterns],
		});
		allFiles.push(...matches);
	}

	return [...new Set(allFiles)].sort((a, b) => a.localeCompare(b));
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

function canConvertToFunctionDeclaration(
	node: ts.FunctionLikeDeclaration,
	sourceFile: ts.SourceFile,
): boolean {
	if (!hasNoThisKeyword(node)) {
		return false;
	}

	const sourceFileFunctions = collectSourceFileFunctionNames(sourceFile);
	return hasNoExternalVariableReferences({ node, sourceFile, functionNames: sourceFileFunctions });
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
		const { parent } = node;
		if (parent && !ts.isPropertyAccessExpression(parent) && !ts.isElementAccessExpression(parent)) {
			return false;
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

function isArrowFunctionOrFunctionExpression(node: ts.Node): boolean {
	return ts.isArrowFunction(node) || ts.isFunctionExpression(node);
}

function hasExportModifier(node: ts.Node): boolean {
	if (!ts.canHaveModifiers(node)) {
		return false;
	}
	const modifiers = ts.getModifiers(node);
	return !!modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
}
