import ts from "typescript";
import { getPosition, isFunctionLike } from "./ast-utils";
import { buildBlockOrderModel, detectNestedBeforeLogic } from "./nested-block-order";
import type { RuleContext } from "./rule-context";
import type { FunctionInfo, NestedFunctionViolation } from "./types";

export function findNestedViolations(ctx: RuleContext): NestedFunctionViolation[] {
	return findNestedFunctionViolations(ctx.parsedFile.sourceFile, ctx.functions);
}

export function findNestedFunctionViolations(
	sourceFile: ts.SourceFile,
	functions: FunctionInfo[],
): NestedFunctionViolation[] {
	const violations: NestedFunctionViolation[] = [];
	const functionMap = new Map(functions.map((f) => [f.name, f]));
	const context = { sourceFile, functionMap, violations };
	visitForNestedViolations(sourceFile, context);
	return violations;
}

interface NestedViolationContext {
	sourceFile: ts.SourceFile;
	functionMap: Map<string, FunctionInfo>;
	violations: NestedFunctionViolation[];
}

function visitForNestedViolations(node: ts.Node, context: NestedViolationContext): void {
	const { sourceFile, functionMap } = context;
	if (ts.isFunctionDeclaration(node) && node.name) {
		const funcInfo = functionMap.get(node.name.getText(sourceFile));
		if (funcInfo) {
			checkFunctionBodyAndProcess(node, funcInfo, context);
		}
	} else if (ts.isVariableStatement(node)) {
		processVariableStatement(node, context);
	} else if (isAnonymousFunctionScope(node)) {
		checkFunctionBodyAndProcess(
			node as ts.ArrowFunction | ts.FunctionExpression,
			syntheticAnonymousParent(node, sourceFile),
			context,
		);
	}
	ts.forEachChild(node, (child) => visitForNestedViolations(child, context));
}

/** Arrow/function-expression containers (describe/test callbacks) — not VariableDeclaration inits. */
function isAnonymousFunctionScope(node: ts.Node): boolean {
	if (!isFunctionLike(node)) return false;
	if (node.parent && ts.isVariableDeclaration(node.parent)) return false;
	const fn = node as ts.ArrowFunction | ts.FunctionExpression;
	return Boolean(fn.body && ts.isBlock(fn.body));
}

function syntheticAnonymousParent(node: ts.Node, sourceFile: ts.SourceFile): FunctionInfo {
	const pos = getPosition(sourceFile, node);
	return {
		name: "<anonymous>",
		kind: ts.isArrowFunction(node) ? "arrow-function" : "function-expression",
		position: {
			...pos,
			start: node.getStart(),
			end: node.getEnd(),
		},
		isExported: false,
		parentFunction: null,
	};
}

function processVariableStatement(
	node: ts.VariableStatement,
	context: NestedViolationContext,
): void {
	const { sourceFile, functionMap } = context;
	for (const decl of node.declarationList.declarations) {
		const isValidArrowFunc =
			decl.initializer &&
			isFunctionLike(decl.initializer) &&
			decl.name &&
			ts.isIdentifier(decl.name);
		if (isValidArrowFunc && decl.name && decl.initializer) {
			const funcInfo = functionMap.get(decl.name.getText(sourceFile));
			if (funcInfo) {
				checkFunctionBodyAndProcess(
					decl.initializer as ts.FunctionLikeDeclaration,
					funcInfo,
					context,
				);
			}
		}
	}
}

function checkFunctionBodyAndProcess(
	func: ts.FunctionLikeDeclaration,
	funcInfo: FunctionInfo,
	context: NestedViolationContext,
): void {
	const { sourceFile, functionMap, violations } = context;
	if (!(func.body && ts.isBlock(func.body))) {
		return;
	}
	const model = buildBlockOrderModel(func.body, sourceFile);
	for (const nestedName of detectNestedBeforeLogic(model)) {
		const nestedInfo = functionMap.get(nestedName);
		if (!nestedInfo) continue;
		violations.push({
			kind: "nested",
			parent: funcInfo,
			nested: nestedInfo,
			message: `Nested function violation: ${nestedName} should appear after all logic in ${funcInfo.name}`,
		});
	}
	for (const stmt of model.stmts) {
		if (stmt.kind !== "nestedFunc") continue;
		const nestedFunc = extractNestedFunctionLike(stmt.node);
		if (!nestedFunc) continue;
		const nestedInfo = stmt.name ? functionMap.get(stmt.name) : undefined;
		checkFunctionBodyAndProcess(nestedFunc, nestedInfo ?? funcInfo, context);
	}
}

function extractNestedFunctionLike(stmt: ts.Statement): ts.FunctionLikeDeclaration | null {
	if (ts.isFunctionDeclaration(stmt)) {
		return stmt;
	}
	if (ts.isVariableStatement(stmt)) {
		const init = stmt.declarationList.declarations[0]?.initializer;
		if (init && isFunctionLike(init)) {
			return init as ts.FunctionLikeDeclaration;
		}
	}
	return null;
}
