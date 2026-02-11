import { readFileSync, writeFileSync } from "node:fs";
import ts from "typescript";
import { analyzeFiles } from "./analyzer";
import type { Config, FixResult } from "./types";

export async function fixFiles(patterns: string[], config: Config): Promise<FixResult[]> {
	const analysisResults = await analyzeFiles(patterns, config);
	const fixResults: FixResult[] = [];

	for (const result of analysisResults) {
		const fixResult = processAnalysisResult(result, config);
		fixResults.push(fixResult);
	}

	return fixResults;
}

// ORCHESTRATION: high-level decision logic
function processAnalysisResult(
	result: Awaited<ReturnType<typeof analyzeFiles>>[0],
	config: Config,
): FixResult {
	if (result.violations.length === 0 && result.circularDependencies.length === 0) {
		return createNoViolationsResult(result.file);
	}

	if (result.circularDependencies.length > 0) {
		return createCircularDependencyResult(result.file, result.circularDependencies.length);
	}

	return fixFileWithErrorHandling(result.file, config);
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

function fixFileWithErrorHandling(filePath: string, config: Config): FixResult {
	try {
		return fixFile(filePath, config);
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

// FILE PROCESSING: I/O operations
const fileProcessor = createFileProcessor();

function createFileProcessor() {
	return {
		read(filePath: string): string {
			return readFileSync(filePath, "utf-8");
		},
		write(filePath: string, content: string): void {
			writeFileSync(filePath, content, "utf-8");
		},
	};
}

// REORDERING ORCHESTRATION
function fixFile(filePath: string, _config: Config): FixResult {
	const originalContent = fileProcessor.read(filePath);
	const sourceFile = ts.createSourceFile(filePath, originalContent, ts.ScriptTarget.Latest, true);

	const fixedContent = reorderFunctionDeclarations(sourceFile);
	const hasChanges = fixedContent !== originalContent;

	if (hasChanges) {
		fileProcessor.write(filePath, fixedContent);
		return {
			file: filePath,
			fixed: true,
			originalContent,
			fixedContent,
			reordered: countFunctionMovements(originalContent, fixedContent),
			errors: [],
		};
	}

	return {
		file: filePath,
		fixed: false,
		originalContent,
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
	const newSourceFile = ts.factory.updateSourceFile(sourceFile, newStatements);

	return printer.printFile(newSourceFile);
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
