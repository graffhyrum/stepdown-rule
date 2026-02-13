import ts from "typescript";
import { analyzeFiles } from "./analyzer";
import { FileService } from "./services/FileService";
import type { Config, FixResult } from "./types";

export async function fixFiles(
	patterns: string[],
	config: Config,
	fileService?: FileService,
): Promise<FixResult[]> {
	const service = fileService ?? new FileService({ ignore: config.ignore });
	const analysisResults = await analyzeFiles(patterns, config);
	const fixResults: FixResult[] = [];

	for (const result of analysisResults) {
		const fixResult = processAnalysisResult(result, config, service);
		fixResults.push(fixResult);
	}

	return fixResults;
}

function processAnalysisResult(
	result: Awaited<ReturnType<typeof analyzeFiles>>[0],
	config: Config,
	service: FileService,
): FixResult {
	if (result.violations.length === 0 && result.circularDependencies.length === 0) {
		return createNoViolationsResult(result.file);
	}

	if (result.circularDependencies.length > 0) {
		return createCircularDependencyResult(result.file, result.circularDependencies.length);
	}

	return fixFileWithErrorHandling(result.file, config, service);
}

function createNoViolationsResult(file: string): FixResult {
	return {
		file,
		fixed: false,
		originalContent: "",
		fixedContent: "",
		reordered: 0,
		errors: [],
	};
}

function createCircularDependencyResult(file: string, count: number): FixResult {
	return {
		file,
		fixed: false,
		originalContent: "",
		fixedContent: "",
		reordered: 0,
		errors: [`Cannot fix: ${count} circular dependencies detected. Refactoring required.`],
	};
}

function fixFileWithErrorHandling(
	filePath: string,
	config: Config,
	service: FileService,
): FixResult {
	try {
		return fixFile(filePath, config, service);
	} catch (error) {
		return {
			file: filePath,
			fixed: false,
			originalContent: "",
			fixedContent: "",
			reordered: 0,
			errors: [error instanceof Error ? error.message : String(error)],
		};
	}
}

function fixFile(filePath: string, _config: Config, service: FileService): FixResult {
	const originalContent = service.readFile(filePath);
	const fixResult = fixParsedFile(originalContent, filePath, _config);

	if (fixResult.fixed) {
		service.writeFile(filePath, fixResult.fixedContent);
	}

	return fixResult;
}

export function fixParsedFile(content: string, filePath: string, _config: Config): FixResult {
	const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);

	const fixedContent = reorderFunctionDeclarations(sourceFile);
	const hasChanges = fixedContent !== content;

	if (hasChanges) {
		return {
			file: filePath,
			fixed: true,
			originalContent: content,
			fixedContent,
			reordered: countFunctionMovements(content, fixedContent),
			errors: [],
		};
	}

	return {
		file: filePath,
		fixed: false,
		originalContent: content,
		fixedContent,
		reordered: 0,
		errors: [],
	};
}

function reorderFunctionDeclarations(sourceFile: ts.SourceFile): string {
	const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
	const categorized = categorizeNodes(sourceFile);

	const { dependencies } = buildDependencyGraph(categorized.functions, sourceFile);
	const reorderedFunctions = reorderFunctions(categorized.functions, dependencies, sourceFile);

	const newStatements = reconstructStatements(categorized, reorderedFunctions);
	let newSourceFile = ts.factory.updateSourceFile(sourceFile, newStatements);

	newSourceFile = transformNestedBlocks(newSourceFile);

	return printer.printFile(newSourceFile);
}

function transformNestedBlocks(sourceFile: ts.SourceFile): ts.SourceFile {
	return visitForNestedBlocks(sourceFile, sourceFile) as ts.SourceFile;
}

function visitForNestedBlocks(node: ts.Node, sourceFile: ts.SourceFile): ts.Node {
	const arrowOrExpr = tryReorderArrowOrFunctionExpr(node, sourceFile);
	if (arrowOrExpr) return arrowOrExpr;

	const fnDecl = tryReorderFunctionDeclaration(node, sourceFile);
	if (fnDecl) return fnDecl;

	if (ts.isSourceFile(node)) {
		return ts.factory.updateSourceFile(
			node,
			node.statements.map((s) => visitForNestedBlocks(s, sourceFile) as ts.Statement),
		);
	}
	if (ts.isVariableStatement(node)) return visitVariableStatementNested(node, sourceFile);
	if (ts.isCallExpression(node)) return visitCallExpressionNested(node, sourceFile);
	return node;
}

function tryReorderArrowOrFunctionExpr(node: ts.Node, sourceFile: ts.SourceFile): ts.Node | null {
	if (!(ts.isArrowFunction(node) || ts.isFunctionExpression(node))) return null;
	const body = node.body;
	if (!ts.isBlock(body) || body.statements.length < 2) return null;
	const reordered = reorderBlockStatements(body, sourceFile);
	if (!reordered) return null;
	if (ts.isArrowFunction(node)) {
		return ts.factory.updateArrowFunction(
			node,
			node.modifiers,
			node.typeParameters,
			node.parameters,
			node.type,
			node.equalsGreaterThanToken,
			reordered,
		);
	}
	return ts.factory.updateFunctionExpression(
		node,
		node.modifiers,
		node.asteriskToken,
		node.name,
		node.typeParameters,
		node.parameters,
		node.type,
		reordered,
	);
}

function tryReorderFunctionDeclaration(node: ts.Node, sourceFile: ts.SourceFile): ts.Node | null {
	if (!(ts.isFunctionDeclaration(node) && node.body && ts.isBlock(node.body))) return null;
	const body = node.body;
	if (body.statements.length < 2) return null;
	const reordered = reorderBlockStatements(body, sourceFile);
	if (!reordered) return null;
	return ts.factory.updateFunctionDeclaration(
		node,
		node.modifiers,
		node.asteriskToken,
		node.name,
		node.typeParameters,
		node.parameters,
		node.type,
		reordered,
	);
}

function visitVariableStatementNested(
	node: ts.VariableStatement,
	sourceFile: ts.SourceFile,
): ts.Node {
	const newDecls = node.declarationList.declarations.map((d) => {
		if (!d.initializer) return d;
		const newInit = visitForNestedBlocks(d.initializer, sourceFile) as ts.Expression;
		return newInit !== d.initializer
			? ts.factory.updateVariableDeclaration(d, d.name, d.exclamationToken, d.type, newInit)
			: d;
	});
	const changed = newDecls.some((d, i) => d !== node.declarationList.declarations[i]);
	return changed
		? ts.factory.updateVariableStatement(
				node,
				node.modifiers,
				ts.factory.updateVariableDeclarationList(node.declarationList, newDecls),
			)
		: node;
}

function visitCallExpressionNested(node: ts.CallExpression, sourceFile: ts.SourceFile): ts.Node {
	const newArgs = node.arguments.map((arg) => {
		if (!(ts.isFunctionExpression(arg) || ts.isArrowFunction(arg))) return arg;
		return visitForNestedBlocks(arg, sourceFile) as ts.Expression;
	});
	const changed = newArgs.some((a, i) => a !== node.arguments[i]);
	return changed
		? ts.factory.updateCallExpression(node, node.expression, node.typeArguments, newArgs)
		: node;
}

function reorderBlockStatements(block: ts.Block, sourceFile: ts.SourceFile): ts.Block | null {
	const funcStatements: Array<{ stmt: ts.Statement; name: string }> = [];
	for (const stmt of block.statements) {
		const name = extractStatementFunctionName(stmt, sourceFile);
		if (name) funcStatements.push({ stmt, name });
	}
	if (funcStatements.length < 2) return null;

	const functionNames = new Map<string, ts.Node>();
	for (const { stmt, name } of funcStatements) {
		functionNames.set(name, stmt);
	}
	const dependencies = new Map<string, string[]>();
	for (const { stmt, name } of funcStatements) {
		const deps = extractDependenciesFor(stmt, sourceFile, functionNames);
		dependencies.set(name, deps);
	}

	const sorted = topologicalSort(dependencies).reverse();
	const reorderedStmts = sorted
		.map((n) => funcStatements.find((f) => f.name === n)?.stmt)
		.filter((s): s is ts.Statement => s !== undefined);

	const otherStatements = block.statements.filter((s) => !funcStatements.some((f) => f.stmt === s));
	const newStatements = [...reorderedStmts, ...otherStatements];
	if (
		JSON.stringify(newStatements.map((s) => s.getText(sourceFile))) !==
		JSON.stringify(block.statements.map((s) => s.getText(sourceFile)))
	) {
		return ts.factory.createBlock(newStatements, true);
	}
	return null;
}

function extractStatementFunctionName(
	stmt: ts.Statement,
	sourceFile: ts.SourceFile,
): string | null {
	if (ts.isFunctionDeclaration(stmt) && stmt.name) {
		return stmt.name.getText(sourceFile);
	}
	if (ts.isVariableStatement(stmt)) {
		const [decl] = stmt.declarationList.declarations;
		if (
			decl?.name &&
			ts.isIdentifier(decl.name) &&
			decl.initializer &&
			isFunctionExpression(decl.initializer)
		) {
			return decl.name.getText(sourceFile);
		}
	}
	return null;
}

function reconstructStatements(
	categorized: CategorizedNodes,
	reorderedFunctions: Array<{ node: ts.Node; info: null }>,
): ts.Statement[] {
	return [
		...(categorized.imports as ts.Statement[]),
		...reorderedFunctions.map((f) => f.node as ts.Statement),
		...(categorized.other as ts.Statement[]),
		...(categorized.exports as ts.Statement[]),
	];
}

// CATEGORIZATION: classify AST nodes
function categorizeNodes(sourceFile: ts.SourceFile): CategorizedNodes {
	const result: CategorizedNodes = {
		imports: [],
		functions: [],
		exports: [],
		other: [],
	};
	ts.forEachChild(sourceFile, (node) => categorizeNode(node, result));
	return result;
}

function categorizeNode(node: ts.Node, result: CategorizedNodes): void {
	if (isImport(node)) {
		result.imports.push(node);
		return;
	}

	if (isExport(node)) {
		result.exports.push(node);
		return;
	}

	if (isFunctionDeclaration(node)) {
		result.functions.push({ node, info: null });
		return;
	}

	if (ts.isVariableStatement(node)) {
		categorizeVariableStatement(node, result);
		return;
	}

	result.other.push(node);
}

function categorizeVariableStatement(node: ts.VariableStatement, result: CategorizedNodes): void {
	const { declarationList } = node;
	for (const declaration of declarationList.declarations) {
		if (declaration.initializer && isFunctionExpression(declaration.initializer)) {
			result.functions.push({ node, info: null });
			return;
		}
	}
	result.other.push(node);
}

function isImport(node: ts.Node): boolean {
	return ts.isImportDeclaration(node) || ts.isImportEqualsDeclaration(node);
}

function isExport(node: ts.Node): boolean {
	return ts.isExportDeclaration(node);
}

function isFunctionDeclaration(node: ts.Node): boolean {
	const hasName = "name" in node && !!node.name;
	return ts.isFunctionDeclaration(node) && hasName;
}

// DEPENDENCY GRAPH: extract and map function dependencies
function buildDependencyGraph(
	functions: Array<{ node: ts.Node; info: null }>,
	sourceFile: ts.SourceFile,
): { functionNames: Map<string, ts.Node>; dependencies: Map<string, string[]> } {
	const functionNames = new Map<string, ts.Node>();
	const dependencies = new Map<string, string[]>();

	for (const { node } of functions) {
		const name = extractFunctionName(node, sourceFile);
		if (name) {
			functionNames.set(name, node);
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

function extractDependenciesFor(
	node: ts.Node,
	sourceFile: ts.SourceFile,
	functionNames: Map<string, ts.Node>,
): string[] {
	const context: DependencyExtractionContext = { sourceFile, functionNames, dependencies: [] };
	visitNodeForDependencies(node, context);
	return [...new Set(context.dependencies)];
}

function visitNodeForDependencies(node: ts.Node, context: DependencyExtractionContext): void {
	if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
		const calledName = node.expression.getText(context.sourceFile);
		if (context.functionNames.has(calledName)) {
			context.dependencies.push(calledName);
		}
	}
	ts.forEachChild(node, (child) => visitNodeForDependencies(child, context));
}

// TOPOLOGICAL ORDERING: sort functions by dependencies
function reorderFunctions(
	functions: Array<{ node: ts.Node; info: null }>,
	dependencies: Map<string, string[]>,
	sourceFile: ts.SourceFile,
): Array<{ node: ts.Node; info: null }> {
	const sorted = topologicalSort(dependencies).reverse();
	return sorted
		.map((name) => functions.find((f) => extractFunctionName(f.node, sourceFile) === name))
		.filter((f): f is { node: ts.Node; info: null } => f !== undefined);
}

function topologicalSort(dependencies: Map<string, string[]>): string[] {
	const visited = new Set<string>();
	const temp = new Set<string>();
	const result: string[] = [];

	dependencies.forEach((_, name) => {
		if (!visited.has(name)) {
			visitDependencyNode(name, { dependencies, visited, temp, result });
		}
	});

	return result;
}

interface SortContext {
	dependencies: Map<string, string[]>;
	visited: Set<string>;
	temp: Set<string>;
	result: string[];
}

function visitDependencyNode(name: string, context: SortContext): void {
	if (context.temp.has(name)) {
		throw new Error(`Circular dependency detected involving ${name}`);
	}
	if (context.visited.has(name)) {
		return;
	}

	context.temp.add(name);
	const deps = context.dependencies.get(name) || [];
	for (const dep of deps) {
		visitDependencyNode(dep, context);
	}
	context.temp.delete(name);
	context.visited.add(name);
	context.result.push(name);
}

// MOVEMENT COUNTING: quantify function relocations
function countFunctionMovements(original: string, fixed: string): number {
	const originalPositions = buildPositionMap(original);
	const fixedLines = fixed.split("\n");
	let reorders = 0;

	for (const [index, line] of fixedLines.entries()) {
		const trimmed = line.trim();
		const originalPos = originalPositions.get(trimmed);
		if (originalPos !== undefined && Math.abs(originalPos - index) > 10) {
			reorders++;
		}
	}

	return reorders;
}

function buildPositionMap(content: string): Map<string, number> {
	const positions = new Map<string, number>();
	const lines = content.split("\n");

	lines.forEach((line, index) => {
		const trimmed = line.trim();
		if (isFunctionSignature(trimmed)) {
			positions.set(trimmed, index);
		}
	});

	return positions;
}

function isFunctionSignature(trimmed: string): boolean {
	return (
		trimmed.startsWith("function ") || (trimmed.startsWith("const ") && trimmed.includes("=>"))
	);
}

// UTILITIES
function extractFunctionName(node: ts.Node, sourceFile: ts.SourceFile): string | null {
	if (ts.isFunctionDeclaration(node) && node.name) {
		return node.name?.getText(sourceFile);
	}

	if (ts.isVariableStatement(node)) {
		const [declaration] = node.declarationList.declarations;
		if (declaration?.name && ts.isIdentifier(declaration.name)) {
			return declaration.name.getText(sourceFile);
		}
	}

	return null;
}

function isFunctionExpression(node: ts.Node): boolean {
	return ts.isArrowFunction(node) || ts.isFunctionExpression(node);
}

interface CategorizedNodes {
	imports: ts.Node[];
	functions: Array<{
		node: ts.Node;
		info: null;
	}>;
	exports: ts.Node[];
	other: ts.Node[];
}
