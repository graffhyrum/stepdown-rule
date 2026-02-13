import ts from "typescript";

export function isFunctionLike(node: ts.Node): boolean {
	return ts.isArrowFunction(node) || ts.isFunctionExpression(node);
}

export function getPosition(
	sourceFile: ts.SourceFile,
	node: ts.Node,
): { line: number; column: number } {
	const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
	return { line: line + 1, column: character + 1 };
}

export function getPositionFromOffset(
	sourceFile: ts.SourceFile,
	offset: number,
): { line: number; column: number } {
	const { line, character } = sourceFile.getLineAndCharacterOfPosition(offset);
	return { line: line + 1, column: character + 1 };
}
