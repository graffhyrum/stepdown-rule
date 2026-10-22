import ts from "typescript";
import { getPosition, isFunctionLike } from "./ast-utils";
import type { FunctionInfo } from "./types";

export function extractFunctions(sourceFile: ts.SourceFile): FunctionInfo[] {
	const functions: FunctionInfo[] = [];
	visitForFunctionExtraction(sourceFile, null);
	return functions;
	function visitForFunctionExtraction(node: ts.Node, parentFunction: string | null) {
		if (ts.isFunctionDeclaration(node) && node.name) {
			const funcName = node.name.getText(sourceFile);
			handleFunctionDeclaration({ name: node.name, node, sourceFile, functions, parentFunction });
			ts.forEachChild(node, (child) => visitForFunctionExtraction(child, funcName));
			return;
		}
		if (ts.isVariableStatement(node)) {
			const context: VariableStatementContext = {
				sourceFile,
				functions,
				parentFunction,
			};
			const funcName = handleVariableStatement(node, context);
			if (funcName) {
				ts.forEachChild(node, (child) => visitForFunctionExtraction(child, funcName));
				return;
			}
		}
		const anonymousScope = getAnonymousScopeName(node, parentFunction);
		if (anonymousScope) {
			ts.forEachChild(node, (child) => visitForFunctionExtraction(child, anonymousScope));
			return;
		}
		ts.forEachChild(node, (child) => visitForFunctionExtraction(child, parentFunction));
	}
}

function getAnonymousScopeName(node: ts.Node, parentFunction: string | null): string | null {
	if (!isFunctionLike(node)) return null;
	if (node.parent && ts.isVariableDeclaration(node.parent)) return null;
	return parentFunction ? `${parentFunction}.<anonymous>` : "<anonymous>";
}

function handleVariableStatement(
	node: ts.VariableStatement,
	context: VariableStatementContext,
): string | null {
	const { declarationList } = node;
	let firstFuncName: string | null = null;
	for (const declaration of declarationList.declarations) {
		const funcName = extractVariableFunction(declaration, node, context);
		if (funcName && !firstFuncName) {
			firstFuncName = funcName;
		}
	}
	return firstFuncName;
}

function extractVariableFunction(
	declaration: ts.VariableDeclaration,
	node: ts.VariableStatement,
	context: VariableStatementContext,
): string | null {
	if (!(declaration.initializer && isFunctionLike(declaration.initializer))) {
		return null;
	}
	const functionInfo = createVariableFunctionInfo(declaration, node, context);
	if (!functionInfo) {
		return null;
	}
	context.functions.push(functionInfo);
	return functionInfo.name;
}

function createVariableFunctionInfo(
	declaration: ts.VariableDeclaration,
	node: ts.VariableStatement,
	context: VariableStatementContext,
): FunctionInfo | null {
	const name = declaration.name?.getText(context.sourceFile);
	if (!(name && declaration.initializer)) {
		return null;
	}
	const pos = getPosition(context.sourceFile, node);
	return {
		name,
		kind: ts.isArrowFunction(declaration.initializer) ? "arrow-function" : "function-expression",
		position: {
			...pos,
			start: node.getStart(),
			end: node.getEnd(),
		},
		isExported: hasExportModifier(node),
		parentFunction: context.parentFunction,
	};
}

function handleFunctionDeclaration(params: {
	name: ts.Identifier;
	node: ts.FunctionDeclaration;
	sourceFile: ts.SourceFile;
	functions: FunctionInfo[];
	parentFunction: string | null;
}): void {
	const { name, node, sourceFile, functions, parentFunction } = params;
	const pos = getPosition(sourceFile, node);
	const functionInfo: FunctionInfo = {
		name: name.getText(sourceFile),
		kind: "declaration",
		position: {
			...pos,
			start: node.getStart(),
			end: node.getEnd(),
		},
		isExported: hasExportModifier(node),
		parentFunction,
	};
	functions.push(functionInfo);
}

function hasExportModifier(node: ts.Node): boolean {
	if (!ts.canHaveModifiers(node)) {
		return false;
	}
	const modifiers = ts.getModifiers(node);
	return !!modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
}

interface VariableStatementContext {
	sourceFile: ts.SourceFile;
	functions: FunctionInfo[];
	parentFunction: string | null;
}
