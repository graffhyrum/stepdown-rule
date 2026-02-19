import ts from "typescript";
import { analyzeParsedFile, analyzeWithRules, buildRuleContext } from "./analyzer";
import { isFunctionLike } from "./ast-utils";
import { getEnabled } from "./registry";
import type { ViolationRule } from "./rule-context";
import { FileService } from "./services/FileService";
import type { AnalysisResult, Config, FixResult } from "./types";

export interface PipelineResult {
	analysisResults: AnalysisResult[];
	fixResults: FixResult[];
}

export async function runPipeline(
	patterns: string[],
	config: Config,
	fileService?: FileService,
): Promise<PipelineResult> {
	const service = fileService ?? new FileService({ ignore: config.ignore });
	const files = await service.resolveFiles(patterns);
	const enabledRules = getEnabled(config.enabledRuleIds);
	const useRulePipeline = config.enabledRuleIds !== undefined && enabledRules.length > 0;

	const analysisResults: AnalysisResult[] = [];
	const fixResults: FixResult[] = [];

	for (const filePath of files) {
		const { analysisResult, fixResult } = await processOneFile({
			filePath,
			config,
			service,
			enabledRules,
			useRulePipeline,
		});
		analysisResults.push(analysisResult);
		if (config.fix && fixResult) {
			fixResults.push(fixResult);
		}
	}

	return { analysisResults, fixResults };
}

async function processOneFile(params: {
	filePath: string;
	config: Config;
	service: FileService;
	enabledRules: ViolationRule[];
	useRulePipeline: boolean;
}): Promise<{ analysisResult: AnalysisResult; fixResult: FixResult | null }> {
	const { filePath, config, service, enabledRules, useRulePipeline } = params;
	const parsedFile = await service.parseFile(filePath);
	const analysisResult = useRulePipeline
		? analyzeWithRules(parsedFile, enabledRules)
		: analyzeParsedFile(parsedFile);

	if (!config.fix) {
		return { analysisResult, fixResult: null };
	}

	if (useRulePipeline) {
		const content = await service.readFile(filePath);
		const result = fixFileWithRules({
			filePath,
			originalContent: content,
			enabledRules,
			service,
		});
		if (result.fixed) {
			await service.writeFile(filePath, result.fixedContent);
		}
		return { analysisResult, fixResult: result };
	}

	const fixResult = await processAndFixLegacy(analysisResult, config, service);
	return { analysisResult, fixResult };
}

function processAndFixLegacy(
	result: AnalysisResult,
	config: Config,
	service: FileService,
): Promise<FixResult> {
	return processAnalysisResult(result, config, service);
}

export async function fixFiles(
	patterns: string[],
	config: Config,
	fileService?: FileService,
): Promise<FixResult[]> {
	const { fixResults } = await runPipeline(patterns, { ...config, fix: true }, fileService);
	return fixResults;
}

export function fixFileWithRules(params: {
	filePath: string;
	originalContent: string;
	enabledRules: ViolationRule[];
	service: FileService;
}): FixResult {
	const { filePath, originalContent, enabledRules, service } = params;
	let content = originalContent;
	for (const rule of enabledRules) {
		const parsedFile = service.parseContent(content, filePath);
		const ctx = buildRuleContext(parsedFile);
		const violations = rule.analyze(ctx);
		if (violations.length > 0) {
			content = rule.fix(ctx, violations);
		}
	}
	const fixed = content !== originalContent;
	return {
		file: filePath,
		fixed,
		originalContent,
		fixedContent: content,
		reordered: fixed ? countFunctionMovements(originalContent, content) : 0,
		errors: [],
	};
}

async function processAnalysisResult(
	result: AnalysisResult,
	config: Config,
	service: FileService,
): Promise<FixResult> {
	if (result.violations.length === 0) {
		return createNoViolationsResult(result.file);
	}

	return await fixFileWithErrorHandling({
		filePath: result.file,
		config,
		service,
		analysisResult: result,
	});
}

function createNoViolationsResult(file: string): FixResult {
	return createUnfixedResult(file, []);
}

async function fixFileWithErrorHandling(params: {
	filePath: string;
	config: Config;
	service: FileService;
	analysisResult: AnalysisResult;
}): Promise<FixResult> {
	try {
		return await fixFile(params);
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		return createUnfixedResult(params.filePath, [errorMessage]);
	}
}

function createUnfixedResult(file: string, errors: string[] = []): FixResult {
	return {
		file,
		fixed: false,
		originalContent: "",
		fixedContent: "",
		reordered: 0,
		errors,
	};
}

export async function fixFile(params: {
	filePath: string;
	config: Config;
	service: FileService;
	analysisResult: AnalysisResult;
}): Promise<FixResult> {
	const { filePath, config, service, analysisResult } = params;
	const originalContent = await service.readFile(filePath);
	const fixResult = fixParsedFile({ content: originalContent, filePath, config, analysisResult });

	if (fixResult.fixed) {
		await service.writeFile(filePath, fixResult.fixedContent);
	}

	return fixResult;
}

export function fixParsedFile(params: {
	content: string;
	filePath: string;
	config?: Config;
	analysisResult?: AnalysisResult;
}): FixResult {
	const { content, filePath, analysisResult } = params;
	const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);

	const fixedContent = reorderFunctionDeclarations(sourceFile, analysisResult?.dependencyGraph);
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

const defaultPrinter = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });

export function reorderTopLevelOnly(
	sourceFile: ts.SourceFile,
	dependencyGraph: Map<string, string[]>,
): string {
	const categorized = categorizeNodes(sourceFile);
	const reorderedFunctions = reorderFunctions(categorized.functions, dependencyGraph, sourceFile);
	const newStatements = reconstructStatements(categorized, reorderedFunctions);
	const newSourceFile = ts.factory.updateSourceFile(sourceFile, newStatements);
	return defaultPrinter.printFile(newSourceFile);
}

export function applyNestedOnly(sourceFile: ts.SourceFile): string {
	return defaultPrinter.printFile(transformNestedBlocks(sourceFile));
}

function reorderFunctionDeclarations(
	sourceFile: ts.SourceFile,
	analyzerDependencyGraph?: Map<string, string[]>,
): string {
	const categorized = categorizeNodes(sourceFile);

	const dependencies =
		analyzerDependencyGraph ?? buildDependencyGraph(categorized.functions, sourceFile).dependencies;
	const reorderedFunctions = reorderFunctions(categorized.functions, dependencies, sourceFile);

	const newStatements = reconstructStatements(categorized, reorderedFunctions);
	let newSourceFile = ts.factory.updateSourceFile(sourceFile, newStatements);

	newSourceFile = transformNestedBlocks(newSourceFile);

	return defaultPrinter.printFile(newSourceFile);
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
	if (!isFunctionLike(node)) return null;
	const fn = node as ts.ArrowFunction | ts.FunctionExpression;
	const body = fn.body;
	if (!ts.isBlock(body) || body.statements.length < 2) return null;
	const reordered = reorderBlockStatements(body, sourceFile);
	if (!reordered) return null;
	if (ts.isArrowFunction(fn)) {
		return ts.factory.updateArrowFunction(
			fn,
			fn.modifiers,
			fn.typeParameters,
			fn.parameters,
			fn.type,
			fn.equalsGreaterThanToken,
			reordered,
		);
	}
	return ts.factory.updateFunctionExpression(
		fn,
		fn.modifiers,
		fn.asteriskToken,
		fn.name,
		fn.typeParameters,
		fn.parameters,
		fn.type,
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
		if (!isFunctionLike(arg)) return arg;
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

	const blockSourceOrder = new Map<string, number>();
	for (const [i, { name }] of funcStatements.entries()) {
		blockSourceOrder.set(name, i);
	}
	const sorted = topologicalSort(dependencies, blockSourceOrder).reverse();
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
			isFunctionLike(decl.initializer)
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
		if (declaration.initializer && isFunctionLike(declaration.initializer)) {
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
		if (name) functionNames.set(name, node);
	}
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
	const sourceOrder = new Map<string, number>();
	const nameToFunc = new Map<string, { node: ts.Node; info: null }>();

	for (const [i, f] of functions.entries()) {
		const name = extractFunctionName(f.node, sourceFile);
		if (name) {
			sourceOrder.set(name, i);
			nameToFunc.set(name, f);
		}
	}

	// Remove leaf functions (those with no outgoing edges) to break cycles
	const leafNames = findAndRemoveLeafFunctions(dependencies, sourceOrder);
	const leafFunctions = leafNames
		.map((name) => nameToFunc.get(name))
		.filter((f): f is { node: ts.Node; info: null } => f !== undefined);

	const sorted = topologicalSort(dependencies, sourceOrder).reverse();
	const sortedFunctions = sorted
		.map((name) => nameToFunc.get(name))
		.filter((f): f is { node: ts.Node; info: null } => f !== undefined);

	// Append leaf functions in their original order
	return [...sortedFunctions, ...leafFunctions];
}

function findAndRemoveLeafFunctions(
	dependencies: Map<string, string[]>,
	sourceOrder: Map<string, number>,
): string[] {
	// A leaf function is one with no outgoing edges (empty dependencies)
	const leaves: string[] = [];

	// Collect all leaf function names
	const leafNames: string[] = [];
	for (const [name, deps] of dependencies) {
		if (deps.length === 0) {
			leafNames.push(name);
		}
	}

	// Remove them from the dependency map and collect for later
	for (const name of leafNames) {
		dependencies.delete(name);
		leaves.push(name);
	}

	// Sort leaves by their original source order
	leaves.sort((a, b) => (sourceOrder.get(a) ?? 999) - (sourceOrder.get(b) ?? 999));

	return leaves;
}

function topologicalSort(
	dependencies: Map<string, string[]>,
	sourceOrder: Map<string, number>,
): string[] {
	const visited = new Set<string>();
	const temp = new Set<string>();
	const result: string[] = [];

	const names = [...dependencies.keys()].sort(
		(a, b) => (sourceOrder.get(a) ?? 999) - (sourceOrder.get(b) ?? 999),
	);
	for (const name of names) {
		if (!visited.has(name)) {
			visitDependencyNode(name, { dependencies, visited, temp, result, sourceOrder });
		}
	}

	// Add any functions that weren't visited (due to cycles) at the end in source order
	const unvisited = names.filter((name) => !visited.has(name));
	result.push(...unvisited);

	return result;
}

interface SortContext {
	dependencies: Map<string, string[]>;
	visited: Set<string>;
	temp: Set<string>;
	result: string[];
	sourceOrder: Map<string, number>;
}

function visitDependencyNode(name: string, context: SortContext): void {
	if (context.temp.has(name)) {
		// Cycle detected - silently skip to allow partial ordering
		// Functions involved in cycles will be placed at the end in original order
		return;
	}
	if (context.visited.has(name)) {
		return;
	}

	context.temp.add(name);
	const deps = context.dependencies.get(name) || [];
	const orderedDeps = [...deps].sort(
		(a, b) => (context.sourceOrder.get(a) ?? 999) - (context.sourceOrder.get(b) ?? 999),
	);
	for (const dep of orderedDeps) {
		// Only visit if the dependency is still in the graph (not a leaf we removed)
		if (context.dependencies.has(dep)) {
			visitDependencyNode(dep, context);
		}
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

interface CategorizedNodes {
	imports: ts.Node[];
	functions: Array<{
		node: ts.Node;
		info: null;
	}>;
	exports: ts.Node[];
	other: ts.Node[];
}
