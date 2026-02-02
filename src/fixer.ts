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

function reorderFunctions(sourceFile: ts.SourceFile): string {
	const printer = ts.createPrinter({
		newLine: ts.NewLineKind.LineFeed,
	});

	const imports: ts.Node[] = [];
	const functions: Array<{ node: ts.Node; info: null }> = [];
	const exports: ts.Node[] = [];
	const other: ts.Node[] = [];

	function addFunctionOrOther(node: ts.VariableStatement) {
		const { declarationList } = node;
		for (const declaration of declarationList.declarations) {
			if (declaration.initializer && isArrowFunctionOrFunctionExpression(declaration.initializer)) {
				functions.push({ node, info: null });
				return;
			}
		}
		other.push(node);
	}

	function categorizeImport(node: ts.Node): boolean {
		if (ts.isImportDeclaration(node) || ts.isImportEqualsDeclaration(node)) {
			imports.push(node);
			return true;
		}
		return false;
	}

	function categorizeNode(node: ts.Node) {
		if (categorizeImport(node)) {
			return;
		}
		if (ts.isExportDeclaration(node)) {
			exports.push(node);
		} else if (ts.isFunctionDeclaration(node) && node.name) {
			functions.push({ node, info: null });
		} else if (ts.isVariableStatement(node)) {
			addFunctionOrOther(node);
		} else {
			other.push(node);
		}
	}

	ts.forEachChild(sourceFile, categorizeNode);

	// Build dependency graph
	const functionNames = new Map<string, ts.Node>();
	for (const { node } of functions) {
		const name = getFunctionName(node, sourceFile);
		if (name) {
			functionNames.set(name, node);
		}
	}

	const dependencies = new Map<string, string[]>();
	for (const { node } of functions) {
		const name = getFunctionName(node, sourceFile);
		if (name) {
			const deps = extractDependencies(node, sourceFile, functionNames);
			dependencies.set(name, deps);
		}
	}

	// Topological sort
	const sorted = topologicalSort(dependencies);
	const reorderedFunctions = sorted
		.map((name) => functions.find((f) => getFunctionName(f.node, sourceFile) === name))
		.filter((f): f is { node: ts.Node; info: null } => f !== undefined);

	// Reconstruct file
	const newStatements: ts.Statement[] = [
		...(imports as ts.Statement[]),
		...reorderedFunctions.map((f) => f.node as ts.Statement),
		...(other as ts.Statement[]),
		...(exports as ts.Statement[]),
	];

	const newSourceFile = ts.factory.updateSourceFile(sourceFile, newStatements);

	return printer.printFile(newSourceFile);
}

function isArrowFunctionOrFunctionExpression(node: ts.Node): boolean {
	return ts.isArrowFunction(node) || ts.isFunctionExpression(node);
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
