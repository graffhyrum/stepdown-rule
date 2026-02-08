import { readFileSync, writeFileSync } from "node:fs";
import ts from "typescript";
import { analyzeFiles } from "./analyzer";
import type { Config, FixResult } from "./types";
export async function fixFiles(patterns: string[], config: Config): Promise<FixResult[]> {
	const analysisResults = await analyzeFiles(patterns, config);
	const fixResults: FixResult[] = [];
	for (const result of analysisResults) {
		if (result.violations.length === 0 && result.circularDependencies.length === 0) {
			fixResults.push({
				file: result.file,
				fixed: false,
				originalContent: "",
				fixedContent: "",
				reordered: 0,
				errors: [],
			});
			continue;
		}
		try {
			const fixResult = fixFile(result.file, config);
			fixResults.push(fixResult);
		} catch (error) {
			fixResults.push({
				file: result.file,
				fixed: false,
				originalContent: "",
				fixedContent: "",
				reordered: 0,
				errors: [error instanceof Error ? error.message : String(error)],
			});
		}
	}
	return fixResults;
}
function fixFile(filePath: string, _config: Config): FixResult {
	const originalContent = readFileSync(filePath, "utf-8");
	const sourceFile = ts.createSourceFile(filePath, originalContent, ts.ScriptTarget.Latest, true);
	try {
		const fixedContent = reorderFunctions(sourceFile);
		if (fixedContent !== originalContent) {
			writeFileSync(filePath, fixedContent, "utf-8");
			return {
				file: filePath,
				fixed: true,
				originalContent,
				fixedContent,
				reordered: countFunctionReorders(originalContent, fixedContent),
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
	} catch (error) {
		return {
			file: filePath,
			fixed: false,
			originalContent,
			fixedContent: "",
			reordered: 0,
			errors: [error instanceof Error ? error.message : String(error)],
		};
	}
}
function countFunctionReorders(original: string, fixed: string): number {
	const originalLines = original.split("\n");
	const fixedLines = fixed.split("\n");
	// Simple heuristic: count lines that moved more than 10 positions
	let reorders = 0;
	const originalPositions = new Map<string, number>();
	originalLines.forEach((line, index) => {
		if (
			line.trim().startsWith("function ") ||
			(line.trim().startsWith("const ") && line.includes("=>"))
		) {
			originalPositions.set(line.trim(), index);
		}
	});
	for (const [index, line] of fixedLines.entries()) {
		const trimmed = line.trim();
		if (originalPositions.has(trimmed)) {
			const originalPos = originalPositions.get(trimmed);
			if (originalPos !== undefined && Math.abs(originalPos - index) > 10) {
				reorders++;
			}
		}
	}
	return reorders;
}
interface CategorizedNodes {
	imports: ts.Node[];
	functions: Array<{ node: ts.Node; info: null }>;
	exports: ts.Node[];
	other: ts.Node[];
}

function reorderFunctions(sourceFile: ts.SourceFile): string {
	const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
	const categorized = categorizeNodes(sourceFile);
	const { dependencies } = buildDependencyGraph(categorized.functions, sourceFile);
	const reorderedFunctions = sortFunctionsByDependency(
		categorized.functions,
		dependencies,
		sourceFile,
	);
	const newStatements = buildNewStatements(categorized, reorderedFunctions);
	const newSourceFile = ts.factory.updateSourceFile(sourceFile, newStatements);
	return printer.printFile(newSourceFile);
}

function categorizeNodes(sourceFile: ts.SourceFile): CategorizedNodes {
	const result: CategorizedNodes = { imports: [], functions: [], exports: [], other: [] };

	ts.forEachChild(sourceFile, (node) => categorizeNode(node, result));
	return result;
}

function categorizeNode(node: ts.Node, result: CategorizedNodes): void {
	if (ts.isImportDeclaration(node) || ts.isImportEqualsDeclaration(node)) {
		result.imports.push(node);
		return;
	}
	if (ts.isExportDeclaration(node)) {
		result.exports.push(node);
		return;
	}
	if (ts.isFunctionDeclaration(node) && node.name) {
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
		if (declaration.initializer && isArrowFunctionOrFunctionExpression(declaration.initializer)) {
			result.functions.push({ node, info: null });
			return;
		}
	}
	result.other.push(node);
}

function buildDependencyGraph(
	functions: Array<{ node: ts.Node; info: null }>,
	sourceFile: ts.SourceFile,
): { functionNames: Map<string, ts.Node>; dependencies: Map<string, string[]> } {
	const functionNames = new Map<string, ts.Node>();
	const dependencies = new Map<string, string[]>();

	for (const { node } of functions) {
		const name = getFunctionName(node, sourceFile);
		if (name) {
			functionNames.set(name, node);
			dependencies.set(name, extractDependencies(node, sourceFile, functionNames));
		}
	}

	return { functionNames, dependencies };
}

function sortFunctionsByDependency(
	functions: Array<{ node: ts.Node; info: null }>,
	dependencies: Map<string, string[]>,
	sourceFile: ts.SourceFile,
): Array<{ node: ts.Node; info: null }> {
	const sorted = topologicalSort(dependencies).reverse();
	return sorted
		.map((name) => functions.find((f) => getFunctionName(f.node, sourceFile) === name))
		.filter((f): f is { node: ts.Node; info: null } => f !== undefined);
}

function buildNewStatements(
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
function topologicalSort(dependencies: Map<string, string[]>): string[] {
	const visited = new Set<string>();
	const temp = new Set<string>();
	const result: string[] = [];
	function visit(name: string) {
		if (temp.has(name)) {
			throw new Error(`Circular dependency detected involving ${name}`);
		}
		if (visited.has(name)) {
			return;
		}
		temp.add(name);
		const deps = dependencies.get(name) || [];
		for (const dep of deps) {
			visit(dep);
		}
		temp.delete(name);
		visited.add(name);
		result.push(name);
	}
	dependencies.forEach((_, name) => {
		if (!visited.has(name)) {
			visit(name);
		}
	});
	return result;
}
function extractDependencies(
	node: ts.Node,
	sourceFile: ts.SourceFile,
	functionNames: Map<string, ts.Node>,
): string[] {
	const dependencies: string[] = [];
	function visit(n: ts.Node) {
		if (ts.isCallExpression(n) && ts.isIdentifier(n.expression)) {
			const calledName = n.expression.getText(sourceFile);
			if (functionNames.has(calledName)) {
				dependencies.push(calledName);
			}
		}
		ts.forEachChild(n, visit);
	}
	visit(node);
	return [...new Set(dependencies)];
}
function getFunctionName(node: ts.Node, sourceFile: ts.SourceFile): string | null {
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
function isArrowFunctionOrFunctionExpression(node: ts.Node): boolean {
	return ts.isArrowFunction(node) || ts.isFunctionExpression(node);
}
