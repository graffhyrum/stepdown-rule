import ts from "typescript";
import { FileService } from "./services/FileService";
import type { ParsedFile } from "./services/types";
import type {
	AnalysisResult,
	CallSite,
	Config,
	FunctionInfo,
	NestedFunctionViolation,
	StepdownViolation,
} from "./types";

export async function analyzeFiles(
	patterns: string[],
	config: Config,
	fileService?: FileService,
): Promise<AnalysisResult[]> {
	const service = fileService ?? new FileService({ ignore: config.ignore });
	const files = await service.resolveFiles(patterns);
	const results: AnalysisResult[] = [];

	for (const filePath of files) {
		const parsedFile = service.parseFile(filePath);
		const result = analyzeParsedFile(parsedFile);
		results.push(result);
	}

	return results;
}

export function analyzeParsedFile(parsedFile: ParsedFile): AnalysisResult {
	const { sourceFile, filePath } = parsedFile;

	const functions = extractFunctions(sourceFile);
	const callGraph = buildCallGraph(functions, sourceFile);
	const violations = findViolations(functions, callGraph);
	const nestedFunctionViolations = findNestedFunctionViolations(sourceFile, functions);
	const circularDependencies = detectCircularDependencies(functions, callGraph);

	// Filter out violations that are part of circular dependency cycles (not actionable)
	const actionableViolations = filterOutCircularViolations(violations, circularDependencies);

	return {
		file: filePath,
		violations: actionableViolations,
		nestedFunctionViolations,
		circularDependencies,
		totalFunctions: functions.length,
	};
}

function extractFunctions(sourceFile: ts.SourceFile): FunctionInfo[] {
	const functions: FunctionInfo[] = [];

	visit(sourceFile, null);
	return functions;

	function visit(node: ts.Node, parentFunction: string | null) {
		if (ts.isFunctionDeclaration(node) && node.name) {
			const funcName = node.name.getText(sourceFile);
			handleFunctionDeclaration({ name: node.name, node, sourceFile, functions, parentFunction });
			// Continue traversing with this function as the parent
			ts.forEachChild(node, (child) => visit(child, funcName));
			return;
		}
		if (ts.isVariableStatement(node) && !hasExportModifier(node)) {
			// Check if this variable statement contains a function
			const context: VariableStatementContext = { sourceFile, functions, parentFunction };
			const funcName = handleVariableStatement(node, context);
			if (funcName) {
				// Continue traversing with this function as the parent
				ts.forEachChild(node, (child) => visit(child, funcName));
				return;
			}
		}

		ts.forEachChild(node, (child) => visit(child, parentFunction));
	}
}

interface CallSiteInfo {
	calledFunction: string;
	callSite: CallSite;
}

function buildCallGraph(
	functions: FunctionInfo[],
	sourceFile: ts.SourceFile,
): Map<string, CallSiteInfo[]> {
	const callGraph = new Map<string, CallSiteInfo[]>();
	const functionNames = new Set(functions.map((f) => f.name));

	for (const func of functions) {
		callGraph.set(func.name, []);
	}

	visit(sourceFile);

	return callGraph;

	function visit(node: ts.Node) {
		if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
			const calledFunction = node.expression.getText(sourceFile);
			if (functionNames.has(calledFunction)) {
				const container = findContainingFunction(node, sourceFile);
				if (container) {
					const callSite: CallSite = {
						line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
						column: sourceFile.getLineAndCharacterOfPosition(node.getStart()).character + 1,
					};
					recordDependency(calledFunction, container, callSite);
				}
			}
		}
		ts.forEachChild(node, visit);
	}

	function recordDependency(calledFunction: string, container: string, callSite: CallSite) {
		const deps = callGraph.get(container);
		if (deps) {
			deps.push({ calledFunction, callSite });
		}
	}
}

function findViolations(
	functions: FunctionInfo[],
	callGraph: Map<string, CallSiteInfo[]>,
): StepdownViolation[] {
	const violations: StepdownViolation[] = [];
	const topLevelFunctions = functions.filter((f) => f.parentFunction === null);

	for (const func of topLevelFunctions) {
		const violations_for_function = findViolationsForFunction(func, functions, callGraph);
		violations.push(...violations_for_function);
	}

	return violations;
}

function findViolationsForFunction(
	func: FunctionInfo,
	functions: FunctionInfo[],
	callGraph: Map<string, CallSiteInfo[]>,
): StepdownViolation[] {
	const violations: StepdownViolation[] = [];
	const callSites = callGraph.get(func.name) || [];

	for (const { calledFunction, callSite } of callSites) {
		if (calledFunction === func.name) {
			continue;
		}

		const depFunc = functions.find((f) => f.name === calledFunction);
		if (!depFunc || depFunc.parentFunction !== null) {
			continue;
		}

		if (depFunc.position.line < func.position.line) {
			violations.push({
				file: "",
				function: func,
				dependency: depFunc,
				message: `Stepdown violation: ${func.name} calls ${calledFunction} which appears above it`,
				callSite,
			});
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
			checkFunctionBodyAndProcess(node, funcInfo, context);
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
				checkFunctionBodyAndProcess(
					decl.initializer as ts.FunctionLikeDeclaration,
					funcInfo,
					context,
				);
			}
		}
	}
}

interface StatementProcessContext {
	parentInfo: FunctionInfo;
	lastLogicLine: number;
	context: NestedViolationContext;
}

interface FunctionDeclParams {
	statement: ts.FunctionDeclaration;
	parentInfo: FunctionInfo;
	lastLogicLine: number;
	context: NestedViolationContext;
}

interface VariableDeclParams {
	statement: ts.VariableStatement;
	parentInfo: FunctionInfo;
	lastLogicLine: number;
	context: NestedViolationContext;
}

function processStatements(
	params: StatementProcessContext & { statements: ts.NodeArray<ts.Statement> },
): void {
	const { statements, parentInfo, lastLogicLine, context } = params;
	for (const statement of statements) {
		if (ts.isFunctionDeclaration(statement)) {
			processFunctionDeclaration({ statement, parentInfo, lastLogicLine, context });
		} else if (ts.isVariableStatement(statement)) {
			processVariableDeclaration({ statement, parentInfo, lastLogicLine, context });
		}
	}
}

function processFunctionDeclaration(params: FunctionDeclParams): void {
	const { statement, parentInfo, lastLogicLine, context } = params;
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
			lastLogicLine,
			violations,
			sourceFile,
		});
	}
	if (nestedInfo || statement.body) {
		const targetInfo = nestedInfo || parentInfo;
		checkFunctionBodyAndProcess(statement, targetInfo, context);
	}
}

function processVariableDeclaration(params: VariableDeclParams): void {
	const { statement, parentInfo, lastLogicLine, context } = params;
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
				lastLogicLine,
				violations,
				sourceFile,
			});
			checkFunctionBodyAndProcess(
				decl.initializer as ts.FunctionLikeDeclaration,
				nestedInfo,
				context,
			);
		}
	}
}

function checkFunctionBodyAndProcess(
	func: ts.FunctionLikeDeclaration,
	funcInfo: FunctionInfo,
	context: NestedViolationContext,
): void {
	const { sourceFile } = context;
	if (!(func.body && ts.isBlock(func.body))) {
		return;
	}

	const lastLogicLine = findLastLogicStatementLine(func.body.statements, sourceFile);
	if (lastLogicLine === 0) {
		return;
	}

	processStatements({
		statements: func.body.statements,
		parentInfo: funcInfo,
		lastLogicLine,
		context,
	});
}

/**
 * Find the line number of the last "logic" statement in a block.
 * Logic statements are any statements that are NOT function declarations or
 * variable statements containing arrow functions/function expressions.
 * Returns 0 if no logic statements are found.
 */
function findLastLogicStatementLine(
	statements: ts.NodeArray<ts.Statement>,
	sourceFile: ts.SourceFile,
): number {
	let lastLogicLine = 0;

	for (const statement of statements) {
		// Skip function declarations - they are not "logic"
		if (ts.isFunctionDeclaration(statement)) {
			continue;
		}

		// Skip variable statements that contain arrow functions or function expressions
		if (ts.isVariableStatement(statement)) {
			const hasOnlyFunctionDeclarations = statement.declarationList.declarations.every(
				(decl) => decl.initializer && isArrowFunctionOrFunctionExpression(decl.initializer),
			);
			if (hasOnlyFunctionDeclarations) {
				continue;
			}
		}

		// This is a logic statement - update the last logic line
		const line = sourceFile.getLineAndCharacterOfPosition(statement.getStart()).line + 1;
		lastLogicLine = Math.max(lastLogicLine, line);
	}

	return lastLogicLine;
}

interface ViolationCheckParams {
	nodeStart: number;
	nestedName: string;
	nestedInfo: FunctionInfo;
	parentInfo: FunctionInfo;
	lastLogicLine: number;
	violations: NestedFunctionViolation[];
	sourceFile: ts.SourceFile;
}

function checkAndAddViolation(params: ViolationCheckParams): void {
	const { nodeStart, nestedName, nestedInfo, parentInfo, lastLogicLine, violations, sourceFile } =
		params;
	const nestedLine = sourceFile.getLineAndCharacterOfPosition(nodeStart).line + 1;

	// Rule 1: Logic should come before function declarations within any scope
	// If the nested function declaration appears before the last logic statement, it's a violation
	// Exception: Don't report violation if the nested function is referenced in the function body
	if (
		nestedLine < lastLogicLine &&
		!isReferencedInFunctionBody(nestedName, parentInfo, sourceFile)
	) {
		violations.push({
			file: "",
			parent: parentInfo,
			nested: nestedInfo,
			message: `Nested function violation: ${nestedName} should appear after all logic in ${parentInfo.name}`,
		});
	}
}

function isReferencedInFunctionBody(
	nestedName: string,
	parentInfo: FunctionInfo,
	sourceFile: ts.SourceFile,
): boolean {
	// Find the function declaration for the parent
	const functionNode = findFunctionNode(parentInfo, sourceFile);
	if (!(functionNode && functionNode.body && ts.isBlock(functionNode.body))) {
		return false;
	}

	// Check if the nested function is referenced anywhere in the function body,
	// excluding the nested function's own declaration
	return findIdentifierExcludingDefinitions(functionNode.body, nestedName, sourceFile);
}

function findFunctionNode(
	funcInfo: FunctionInfo,
	sourceFile: ts.SourceFile,
): ts.FunctionLikeDeclaration | null {
	// This is a simplified implementation - in a real scenario you'd need more robust AST traversal
	// For now, we'll search for function declarations by position
	function visit(node: ts.Node): ts.FunctionLikeDeclaration | null {
		if (
			(ts.isFunctionDeclaration(node) ||
				ts.isArrowFunction(node) ||
				ts.isFunctionExpression(node)) &&
			node.getStart() === funcInfo.position.start
		) {
			return node as ts.FunctionLikeDeclaration;
		}
		return ts.forEachChild(node, visit) || null;
	}

	return visit(sourceFile);
}

function isFunctionDefinition(node: ts.Node, name: string, sourceFile: ts.SourceFile): boolean {
	return ts.isFunctionDeclaration(node) && node.name?.getText(sourceFile) === name;
}

function isVariableFunctionDefinition(
	node: ts.Node,
	name: string,
	sourceFile: ts.SourceFile,
): boolean {
	if (!ts.isVariableStatement(node)) {
		return false;
	}

	for (const decl of node.declarationList.declarations) {
		const isMatchingIdentifier =
			decl.name && ts.isIdentifier(decl.name) && decl.name.getText(sourceFile) === name;
		if (isMatchingIdentifier) {
			return true;
		}
	}
	return false;
}

function matchesIdentifier(node: ts.Node, name: string, sourceFile: ts.SourceFile): boolean {
	return ts.isIdentifier(node) && node.getText(sourceFile) === name;
}

function findIdentifierExcludingDefinitions(
	node: ts.Node,
	name: string,
	sourceFile: ts.SourceFile,
): boolean {
	if (isFunctionDefinition(node, name, sourceFile)) {
		return false;
	}

	if (isVariableFunctionDefinition(node, name, sourceFile)) {
		return false;
	}

	if (matchesIdentifier(node, name, sourceFile)) {
		return true;
	}

	for (const child of node.getChildren()) {
		if (findIdentifierExcludingDefinitions(child, name, sourceFile)) {
			return true;
		}
	}
	return false;
}

interface CircularDepsContext {
	cycles: string[][];
	visited: Set<string>;
	recursionStack: Set<string>;
	path: string[];
	callGraph: Map<string, CallSiteInfo[]>;
}

function filterOutCircularViolations(
	violations: StepdownViolation[],
	circularDependencies: string[][],
): StepdownViolation[] {
	const functionsInCycles = new Set<string>();
	for (const cycle of circularDependencies) {
		for (const funcName of cycle) {
			functionsInCycles.add(funcName);
		}
	}

	// Keep only violations where neither function is part of a cycle
	return violations.filter(
		(v) => !(functionsInCycles.has(v.function.name) || functionsInCycles.has(v.dependency.name)),
	);
}

function detectCircularDependencies(
	functions: FunctionInfo[],
	callGraph: Map<string, CallSiteInfo[]>,
): string[][] {
	const context: CircularDepsContext = {
		cycles: [],
		visited: new Set<string>(),
		recursionStack: new Set<string>(),
		path: [],
		callGraph,
	};

	for (const func of functions) {
		if (!context.visited.has(func.name)) {
			dfsDetectCycle(func.name, context);
		}
	}

	return context.cycles;
}

function dfsDetectCycle(funcName: string, context: CircularDepsContext): boolean {
	if (context.recursionStack.has(funcName)) {
		const cycle = extractCycle(funcName, context);
		if (isValidCycle(cycle)) {
			context.cycles.push(cycle);
		}
		return true;
	}

	if (context.visited.has(funcName)) {
		return false;
	}

	context.visited.add(funcName);
	context.recursionStack.add(funcName);
	context.path.push(funcName);

	const callSites = context.callGraph.get(funcName) || [];
	for (const { calledFunction } of callSites) {
		if (dfsDetectCycle(calledFunction, context)) {
			return true;
		}
	}

	context.recursionStack.delete(funcName);
	context.path.pop();
	return false;
}

function extractCycle(funcName: string, context: CircularDepsContext): string[] {
	const cycleStart = context.path.indexOf(funcName);
	return [...context.path.slice(cycleStart), funcName];
}

function isValidCycle(cycle: string[]): boolean {
	// Skip self-recursive cycles (e.g., "A → A → A")
	return cycle.length > 2 || (cycle.length === 2 && cycle[0] !== cycle[1]);
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
		parentFunction,
	};
	functions.push(functionInfo);
}

interface VariableStatementContext {
	sourceFile: ts.SourceFile;
	functions: FunctionInfo[];
	parentFunction: string | null;
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
	if (!(declaration.initializer && isArrowFunctionOrFunctionExpression(declaration.initializer))) {
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

	const functionInfo: FunctionInfo = {
		name,
		kind: ts.isArrowFunction(declaration.initializer) ? "arrow-function" : "function-expression",
		position: {
			line: context.sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
			column: context.sourceFile.getLineAndCharacterOfPosition(node.getStart()).character + 1,
			start: node.getStart(),
			end: node.getEnd(),
		},
		isExported: false,
		dependencies: [],
		canBeFunctionDeclaration: isArrowFunctionOrFunctionExpression(declaration.initializer)
			? canConvertToFunctionDeclaration(
					declaration.initializer as ts.FunctionLikeDeclaration,
					context.sourceFile,
				)
			: false,
		parentFunction: context.parentFunction,
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

	visit(sourceFile);
	return functionNames;

	function visit(node: ts.Node) {
		if (ts.isFunctionDeclaration(node) && node.name) {
			functionNames.add(node.name.getText(sourceFile));
		}
		ts.forEachChild(node, visit);
	}
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
