import ts from "typescript";
import { isFunctionLike } from "./ast-utils";
import { reorderBlockFromModel } from "./nested-block-order";

const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });

export function applyNestedOnly(sourceFile: ts.SourceFile): string {
	return printer.printFile(transformNestedBlocks(sourceFile));
}

export function transformNestedBlocks(sourceFile: ts.SourceFile): ts.SourceFile {
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
	// ExpressionStatement / VariableStatement are container wrappers to reach nested
	// CallExpression callback blocks — not part of BlockOrderModel itself.
	if (ts.isExpressionStatement(node)) {
		const inner = visitForNestedBlocks(node.expression, sourceFile);
		if (inner !== node.expression) {
			return ts.factory.updateExpressionStatement(node, inner as ts.Expression);
		}
		return node;
	}
	if (ts.isVariableStatement(node)) return visitVariableStatementNested(node, sourceFile);
	if (ts.isCallExpression(node)) return visitCallExpressionNested(node, sourceFile);
	return node;
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

function visitVariableStatementNested(
	node: ts.VariableStatement,
	sourceFile: ts.SourceFile,
): ts.Node {
	const newDecls = node.declarationList.declarations.map((d) => {
		if (!d.initializer) return d;
		const newInit = visitForNestedBlocks(d.initializer, sourceFile) as ts.Expression;
		return newInit === d.initializer
			? d
			: ts.factory.updateVariableDeclaration(d, d.name, d.exclamationToken, d.type, newInit);
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

function tryReorderFunctionDeclaration(node: ts.Node, sourceFile: ts.SourceFile): ts.Node | null {
	if (!(ts.isFunctionDeclaration(node) && node.body && ts.isBlock(node.body))) return null;
	const body = node.body;
	if (body.statements.length < 2) return null;
	const reordered = reorderBlockFromModel(body, sourceFile);
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

function tryReorderArrowOrFunctionExpr(node: ts.Node, sourceFile: ts.SourceFile): ts.Node | null {
	if (!isFunctionLike(node)) return null;
	const fn = node as ts.ArrowFunction | ts.FunctionExpression;
	const body = fn.body;
	if (!ts.isBlock(body) || body.statements.length < 2) return null;
	const reordered = reorderBlockFromModel(body, sourceFile);
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
