import ts from "typescript";
import { extractFunctionName } from "./ast-graph-builder";
import { categorizeNodes, reconstructStatements, type FunctionNode } from "./ast-node-visitors";
import {
	findAndRemoveLeafFunctions,
	topologicalSort as sortTopologically,
} from "./graph-algorithms";
const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
export function reorderTopLevelOnly(
	sourceFile: ts.SourceFile,
	dependencyGraph: Map<string, string[]>,
): string {
	return printer.printFile(applyTopLevelReorder(sourceFile, dependencyGraph));
}
export function applyTopLevelReorder(
	sourceFile: ts.SourceFile,
	dependencyGraph: Map<string, string[]>,
): ts.SourceFile {
	const categorized = categorizeNodes(sourceFile);
	const reorderedFunctions = reorderFunctions(categorized.functions, dependencyGraph, sourceFile);
	const newStatements = reconstructStatements(categorized, reorderedFunctions);
	return ts.factory.updateSourceFile(sourceFile, newStatements);
}
function reorderFunctions(
	functions: FunctionNode[],
	rawDependencies: Map<string, string[]>,
	sourceFile: ts.SourceFile,
): FunctionNode[] {
	const sourceOrder = new Map<string, number>();
	const nameToFunc = new Map<string, FunctionNode>();
	for (const [i, f] of functions.entries()) {
		const name = extractFunctionName(f.node, sourceFile);
		if (name) {
			sourceOrder.set(name, i);
			nameToFunc.set(name, f);
		}
	}
	const { leafNames, remaining } = findAndRemoveLeafFunctions(rawDependencies, sourceOrder);
	const leafFunctions = leafNames
		.map((name) => nameToFunc.get(name))
		.filter((f): f is FunctionNode => f !== undefined);
	const sorted = sortTopologically(remaining, sourceOrder).reverse();
	const sortedFunctions = sorted
		.map((name) => nameToFunc.get(name))
		.filter((f): f is FunctionNode => f !== undefined);
	return [...sortedFunctions, ...leafFunctions];
}
