import ts from "typescript";
import { extractDependenciesFor } from "./ast-graph-builder";
import { getPosition, isFunctionLike } from "./ast-utils";
import { topologicalSort } from "./graph-algorithms";
export type BlockStmtKind = "logic" | "nestedFunc" | "other";
export interface BlockStmt {
	kind: BlockStmtKind;
	/** Present when kind === "nestedFunc" */
	name?: string;
	node: ts.Statement;
	startLine: number;
}
export interface NestedFuncEdge {
	from: string;
	to: string;
}
/**
 * Shared block-order model for nested detect and fix.
 *
 * Detect: nestedFunc before last logic line, name ∉ referencedNested → violation.
 * Fix: pinned (logic|other|referenced nested or reached const/let helper) in source order, then movable
 * nestedFuncs topo-sorted (caller before callee) — including a single movable nested.
 *
 * `referencedNested` holds the helpers that must stay in place: those referenced by
 * logic directly, plus non-hoisted (const/let) helpers reached through other nested helpers.
 */
export interface BlockOrderModel {
	stmts: BlockStmt[];
	nestedDeps: NestedFuncEdge[];
	referencedNested: Set<string>;
}
export function reorderBlockFromModel(block: ts.Block, sourceFile: ts.SourceFile): ts.Block | null {
	const model = buildBlockOrderModel(block, sourceFile);
	const nestedFuncs = model.stmts.filter(
		(
			s,
		): s is BlockStmt & {
			kind: "nestedFunc";
			name: string;
		} => s.kind === "nestedFunc" && s.name !== undefined,
	);
	if (nestedFuncs.length === 0) return null;
	const pinned: ts.Statement[] = [];
	const movable: Array<{
		name: string;
		node: ts.Statement;
	}> = [];
	for (const stmt of model.stmts) {
		if (stmt.kind === "nestedFunc" && stmt.name && !model.referencedNested.has(stmt.name)) {
			movable.push({ name: stmt.name, node: stmt.node });
		} else {
			pinned.push(stmt.node);
		}
	}
	if (movable.length === 0) return null;
	const dependencies = new Map<string, string[]>();
	const sourceOrder = new Map<string, number>();
	for (const [i, { name }] of movable.entries()) {
		sourceOrder.set(name, i);
		dependencies.set(
			name,
			model.nestedDeps.filter((e) => e.from === name).map((e) => e.to),
		);
	}
	const sortedNames = topologicalSort(dependencies, sourceOrder).reverse();
	const byName = new Map(movable.map((m) => [m.name, m.node]));
	const sortedMovable = sortedNames
		.map((n) => byName.get(n))
		.filter((s): s is ts.Statement => s !== undefined);
	const newStatements = [...pinned, ...sortedMovable];
	if (
		JSON.stringify(newStatements.map((s) => s.getText(sourceFile))) ===
		JSON.stringify(block.statements.map((s) => s.getText(sourceFile)))
	) {
		return null;
	}
	return ts.factory.createBlock(newStatements, true);
}
export function buildBlockOrderModel(block: ts.Block, sourceFile: ts.SourceFile): BlockOrderModel {
	const stmts: BlockStmt[] = [];
	for (const node of block.statements) {
		const name = nestedFuncName(node, sourceFile);
		if (name) {
			stmts.push({
				kind: "nestedFunc",
				name,
				node,
				startLine: getPosition(sourceFile, node).line,
			});
			continue;
		}
		stmts.push({
			kind: "logic",
			node,
			startLine: getPosition(sourceFile, node).line,
		});
	}
	const nestedNames = new Map<string, ts.Node>();
	for (const stmt of stmts) {
		if (stmt.kind === "nestedFunc" && stmt.name) {
			nestedNames.set(stmt.name, stmt.node);
		}
	}
	const nestedDeps: NestedFuncEdge[] = [];
	for (const stmt of stmts) {
		if (stmt.kind !== "nestedFunc" || !stmt.name) continue;
		for (const to of extractDependenciesFor(stmt.node, sourceFile, nestedNames)) {
			nestedDeps.push({ from: stmt.name, to });
		}
	}
	const direct = collectReferencedNested(stmts, nestedNames, sourceFile);
	const referencedNested = pinUninitializedReached(direct, stmts, nestedDeps);
	return { stmts, nestedDeps, referencedNested };
}
function collectReferencedNested(
	stmts: BlockStmt[],
	nestedNames: Map<string, ts.Node>,
	sourceFile: ts.SourceFile,
): Set<string> {
	const referenced = new Set<string>();
	const known = new Set(nestedNames.keys());
	if (known.size === 0) return referenced;
	for (const stmt of stmts) {
		if (stmt.kind === "nestedFunc") continue;
		collectIdents(stmt.node, sourceFile, known, referenced);
	}
	return referenced;
}
/**
 * A const/let helper is not hoisted: it must stay above any logic that can reach it,
 * even through another nested helper. Function declarations reached only transitively
 * stay movable because hoisting makes them safe.
 */
function pinUninitializedReached(
	direct: Set<string>,
	stmts: BlockStmt[],
	nestedDeps: NestedFuncEdge[],
): Set<string> {
	const hoisted = new Set(
		stmts
			.filter((s) => s.kind === "nestedFunc" && ts.isFunctionDeclaration(s.node))
			.map((s) => s.name),
	);
	const pinned = new Set(direct);
	const reached = new Set(direct);
	const queue = [...direct];
	for (let name = queue.pop(); name !== undefined; name = queue.pop()) {
		for (const { from, to } of nestedDeps) {
			if (from !== name || reached.has(to)) continue;
			reached.add(to);
			queue.push(to);
			if (!hoisted.has(to)) pinned.add(to);
		}
	}
	return pinned;
}
function collectIdents(
	node: ts.Node,
	sourceFile: ts.SourceFile,
	known: Set<string>,
	out: Set<string>,
): void {
	if (ts.isIdentifier(node)) {
		const text = node.getText(sourceFile);
		if (known.has(text)) out.add(text);
	}
	ts.forEachChild(node, (child) => collectIdents(child, sourceFile, known, out));
}
export function detectNestedBeforeLogic(model: BlockOrderModel): string[] {
	let lastLogicLine = 0;
	for (const stmt of model.stmts) {
		if (stmt.kind === "logic" || stmt.kind === "other") {
			lastLogicLine = Math.max(lastLogicLine, stmt.startLine);
		}
	}
	if (lastLogicLine === 0) return [];
	const findings: string[] = [];
	for (const stmt of model.stmts) {
		if (stmt.kind !== "nestedFunc" || !stmt.name) continue;
		if (stmt.startLine < lastLogicLine && !model.referencedNested.has(stmt.name)) {
			findings.push(stmt.name);
		}
	}
	return findings;
}
function nestedFuncName(stmt: ts.Statement, sourceFile: ts.SourceFile): string | null {
	if (ts.isFunctionDeclaration(stmt) && stmt.name) {
		return stmt.name.getText(sourceFile);
	}
	if (ts.isVariableStatement(stmt)) {
		const decls = stmt.declarationList.declarations;
		// Only the first name would register, so a later declarator could be moved below its use.
		if (decls.length > 1) return null;
		const allFunctionLike = decls.every((d) => d.initializer && isFunctionLike(d.initializer));
		if (!allFunctionLike) return null;
		const [decl] = decls;
		if (
			decl?.name &&
			ts.isIdentifier(decl.name) &&
			decl.initializer &&
			isFunctionLike(decl.initializer)
		) {
			return decl.name.getText(sourceFile);
		}
	}
	return null;
}
