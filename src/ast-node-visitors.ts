import ts from "typescript";
import { isFunctionLike } from "./ast-utils";

/**
 * Reusable AST node visitors and categorization logic.
 * Consolidates visitor patterns from analyzer.ts and fixer.ts.
 */

export interface CategorizedNodes {
	imports: ts.Node[];
	functions: Array<{
		node: ts.Node;
		info: null;
	}>;
	exports: ts.Node[];
	other: ts.Node[];
}

/**
 * Categorize top-level statements in a source file.
 * Groups imports, function declarations, exports, and other statements.
 */
export function categorizeNodes(sourceFile: ts.SourceFile): CategorizedNodes {
	const result: CategorizedNodes = {
		imports: [],
		functions: [],
		exports: [],
		other: [],
	};

	for (const node of sourceFile.statements) {
		if (isImport(node)) {
			result.imports.push(node);
		} else if (isExport(node)) {
			result.exports.push(node);
		} else if (isFunctionDeclaration(node)) {
			result.functions.push({ node, info: null });
		} else if (ts.isVariableStatement(node)) {
			handleVariableStatement(node, result);
		} else {
			result.other.push(node);
		}
	}

	return result;
}

/**
 * Check if node is an import statement.
 */
function isImport(node: ts.Node): boolean {
	return ts.isImportDeclaration(node) || ts.isImportEqualsDeclaration(node);
}

/**
 * Check if node is an export statement.
 */
function isExport(node: ts.Node): boolean {
	return ts.isExportDeclaration(node);
}

/**
 * Check if node is a function declaration with a name.
 */
function isFunctionDeclaration(node: ts.Node): boolean {
	const hasName = "name" in node && !!node.name;
	return ts.isFunctionDeclaration(node) && hasName;
}

/**
 * Handle variable statements - extract functions or classify as other.
 */
function handleVariableStatement(node: ts.VariableStatement, result: CategorizedNodes): void {
	const declarationList = node.declarationList;
	for (const declaration of declarationList.declarations) {
		if (declaration.initializer && isFunctionLike(declaration.initializer)) {
			result.functions.push({ node, info: null });
			return;
		}
	}
	result.other.push(node);
}

/**
 * Reconstruct source file statements from categorized nodes and reordered functions.
 */
export function reconstructStatements(
	categorized: CategorizedNodes,
	reorderedFunctions: Array<{ node: ts.Node; info: null }>,
): ts.Statement[] {
	return [
		...(categorized.imports as ts.Statement[]),
		...(reorderedFunctions.map((f) => f.node) as ts.Statement[]),
		...(categorized.other as ts.Statement[]),
		...(categorized.exports as ts.Statement[]),
	];
}

/**
 * Apply a visitor function to all nodes in a tree.
 */
export function visitAllNodes(node: ts.Node, visitor: (node: ts.Node) => void): void {
	visitor(node);
	ts.forEachChild(node, (child) => visitAllNodes(child, visitor));
}

/**
 * Find all nodes matching a predicate in a tree.
 */
export function findNodes(node: ts.Node, predicate: (node: ts.Node) => boolean): ts.Node[] {
	const results: ts.Node[] = [];
	visitAllNodes(node, (n) => {
		if (predicate(n)) {
			results.push(n);
		}
	});
	return results;
}

/**
 * Find the first node matching a predicate.
 */
export function findFirstNode(
	node: ts.Node,
	predicate: (node: ts.Node) => boolean,
): ts.Node | null {
	let result: ts.Node | null = null;
	visitAllNodes(node, (n) => {
		if (!result && predicate(n)) {
			result = n;
		}
	});
	return result;
}
