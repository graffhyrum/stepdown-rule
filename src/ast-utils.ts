import ts from "typescript";

export function isFunctionLike(node: ts.Node): node is ts.ArrowFunction | ts.FunctionExpression {
	return ts.isArrowFunction(node) || ts.isFunctionExpression(node);
}

export function getPosition(
	sourceFile: ts.SourceFile,
	node: ts.Node,
): { line: number; column: number } {
	const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
	return { line: line + 1, column: character + 1 };
}
