import { expect, test } from "bun:test";
import ts from "typescript";
import {
	buildCallGraph,
	buildDependencyGraph,
	callGraphToDependencyMap,
	extractDependenciesFor,
	extractFunctionName,
	extractFunctionNames,
} from "../src/ast-graph-builder";
import {
	categorizeNodes,
	findFirstNode,
	findNodes,
	reconstructStatements,
	visitAllNodes,
} from "../src/ast-node-visitors";
import {
	detectCircularDependencies,
	findAndRemoveLeafFunctions,
	topologicalSort,
} from "../src/graph-algorithms";
import type { FunctionInfo } from "../src/types";

const parseCode = (code: string) =>
	ts.createSourceFile("test.ts", code, ts.ScriptTarget.Latest, true);

// ============ ast-graph-builder tests ============

function requireStatement(sourceFile: ts.SourceFile, index: number): ts.Statement {
	const stmt = sourceFile.statements[index];
	if (!stmt) {
		throw new Error(`Expected statement at index ${index}`);
	}
	return stmt;
}

test("extractFunctionNames extracts all function names from FunctionInfo array", () => {
	const funcs: FunctionInfo[] = [
		{
			name: "foo",
			kind: "declaration",
			isExported: false,
			parentFunction: null,
			position: { start: 0, end: 10, line: 1, column: 0 },
		},
		{
			name: "bar",
			kind: "declaration",
			isExported: false,
			parentFunction: null,
			position: { start: 10, end: 20, line: 2, column: 0 },
		},
	];

	const names = extractFunctionNames(funcs);
	expect(names.has("foo")).toBe(true);
	expect(names.has("bar")).toBe(true);
	expect(names.size).toBe(2);
});

test("extractFunctionName extracts from FunctionDeclaration", () => {
	const code = "function hello() { return 'world'; }";
	const sourceFile = parseCode(code);
	const funcNode = requireStatement(sourceFile, 0);

	const name = extractFunctionName(funcNode, sourceFile);
	expect(name).toBe("hello");
});

test("extractFunctionName extracts from arrow function variable statement", () => {
	const code = "const myFunc = () => 'test';";
	const sourceFile = parseCode(code);
	const varNode = requireStatement(sourceFile, 0);

	const name = extractFunctionName(varNode, sourceFile);
	expect(name).toBe("myFunc");
});

test("extractFunctionName returns name even for non-function variable (delegates filtering to caller)", () => {
	const code = "const x = 42;";
	const sourceFile = parseCode(code);
	const varNode = requireStatement(sourceFile, 0);

	const name = extractFunctionName(varNode, sourceFile);
	// extractFunctionName returns the identifier name; caller is responsible for checking if it's a function
	expect(name).toBe("x");
});

test("buildDependencyGraph creates mapping of functions to their dependencies", () => {
	const code = `function a() { b(); }
function b() { return 'done'; }`;
	const sourceFile = parseCode(code);
	const funcNodes = sourceFile.statements.map((s) => ({ node: s }));

	const graph = buildDependencyGraph(funcNodes, sourceFile);

	expect(graph.functionNames.has("a")).toBe(true);
	expect(graph.functionNames.has("b")).toBe(true);
	expect(graph.dependencies.get("a")).toEqual(["b"]);
	expect(graph.dependencies.get("b")).toEqual([]);
});

test("buildCallGraph records call-site positions", () => {
	const code = `function a() { b(); }
function b() { return 'done'; }`;
	const sourceFile = parseCode(code);
	const callGraph = buildCallGraph(new Set(["a", "b"]), sourceFile);
	const sites = callGraph.get("a") ?? [];
	expect(sites).toHaveLength(1);
	expect(sites[0]?.calledFunction).toBe("b");
	expect(sites[0]?.callSite.line).toBe(1);
	expect(sites[0]?.callSite.column).toBeGreaterThan(0);
	expect(callGraph.get("b")).toEqual([]);
});

test("extractDependenciesFor finds all called functions in a block", () => {
	const code = `function main() {
  a();
  b();
  c();
}
function a() {}
function b() {}
function c() {}`;
	const sourceFile = parseCode(code);
	const mainNode = requireStatement(sourceFile, 0);

	const funcNames = new Map([
		["a", requireStatement(sourceFile, 1)],
		["b", requireStatement(sourceFile, 2)],
		["c", requireStatement(sourceFile, 3)],
	]);

	const deps = extractDependenciesFor(mainNode, sourceFile, funcNames);
	expect(deps).toEqual(["a", "b", "c"]);
});

test("extractDependenciesFor deduplicates dependencies", () => {
	const code = `function main() {
  a();
  a();
}
function a() {}`;
	const sourceFile = parseCode(code);
	const mainNode = requireStatement(sourceFile, 0);

	const funcNames = new Map([["a", requireStatement(sourceFile, 1)]]);

	const deps = extractDependenciesFor(mainNode, sourceFile, funcNames);
	expect(deps).toEqual(["a"]);
});

test("callGraphToDependencyMap converts call graph to simple dependency map", () => {
	const callGraph = new Map([
		[
			"main",
			[
				{ calledFunction: "a", callSite: { line: 1, column: 0 } },
				{ calledFunction: "b", callSite: { line: 2, column: 0 } },
			],
		],
		["a", []],
		["b", []],
	]);

	const depMap = callGraphToDependencyMap(callGraph);

	expect(depMap.get("main")).toEqual(["a", "b"]);
	expect(depMap.get("a")).toEqual([]);
	expect(depMap.get("b")).toEqual([]);
});

// ============ graph-algorithms tests ============

test("topologicalSort orders functions by dependency", () => {
	const deps = new Map([
		["a", []],
		["b", ["a"]],
		["c", ["b"]],
	]);
	const sourceOrder = new Map([
		["a", 0],
		["b", 1],
		["c", 2],
	]);

	const sorted = topologicalSort(deps, sourceOrder);

	const aIdx = sorted.indexOf("a");
	const bIdx = sorted.indexOf("b");
	const cIdx = sorted.indexOf("c");
	expect(aIdx).toBeLessThan(bIdx);
	expect(bIdx).toBeLessThan(cIdx);
});

test("topologicalSort respects source order for independent functions", () => {
	const deps = new Map([
		["a", []],
		["b", []],
		["c", []],
	]);
	const sourceOrder = new Map([
		["c", 0],
		["b", 1],
		["a", 2],
	]);

	const sorted = topologicalSort(deps, sourceOrder);

	// Independent functions should stay in source order
	expect(sorted.indexOf("c")).toBeLessThan(sorted.indexOf("b"));
	expect(sorted.indexOf("b")).toBeLessThan(sorted.indexOf("a"));
});

test("topologicalSort handles cycles by placing unvisited in source order at end", () => {
	const deps = new Map([
		["c", []], // c comes first in source order (no deps)
		["a", ["b"]],
		["b", ["a"]],
	]);
	const sourceOrder = new Map([
		["c", 0],
		["a", 1],
		["b", 2],
	]);

	const sorted = topologicalSort(deps, sourceOrder);

	// c should be first since it has no dependencies
	expect(sorted.indexOf("c")).toBe(0);
	// a and b are cyclic so they stay in source order at the end
	const aIdx = sorted.indexOf("a");
	const bIdx = sorted.indexOf("b");
	expect(aIdx).toBeGreaterThan(0);
	expect(bIdx).toBeGreaterThan(0);
});

test("findAndRemoveLeafFunctions identifies and removes leaves", () => {
	const deps = new Map([
		["a", ["b"]],
		["b", []],
		["c", []],
	]);
	const sourceOrder = new Map([
		["a", 0],
		["b", 1],
		["c", 2],
	]);

	const { leafNames, remaining } = findAndRemoveLeafFunctions(deps, sourceOrder);

	expect(leafNames).toContain("b");
	expect(leafNames).toContain("c");
	expect(deps.has("b")).toBe(true);
	expect(deps.has("c")).toBe(true);
	expect(remaining.has("b")).toBe(false);
	expect(remaining.has("c")).toBe(false);
	expect(remaining.has("a")).toBe(true);
});

test("findAndRemoveLeafFunctions returns leaves in source order", () => {
	const deps = new Map([
		["a", ["b", "c"]],
		["b", []],
		["c", []],
	]);
	const sourceOrder = new Map([
		["a", 0],
		["c", 1], // c comes before b in source
		["b", 2],
	]);

	const { leafNames } = findAndRemoveLeafFunctions(deps, sourceOrder);

	expect(leafNames[0]).toBe("c"); // c before b
	expect(leafNames[1]).toBe("b");
});

test("detectCircularDependencies finds simple cycle", () => {
	const callGraph = new Map([
		["a", [{ calledFunction: "b" }]],
		["b", [{ calledFunction: "a" }]],
	]);
	const functionNames = new Set(["a", "b"]);

	const cycles = detectCircularDependencies(callGraph, functionNames);

	expect(cycles.length).toBeGreaterThan(0);
	expect(cycles[0]).toContain("a");
	expect(cycles[0]).toContain("b");
});

test("detectCircularDependencies finds three-way cycle", () => {
	const callGraph = new Map([
		["a", [{ calledFunction: "b" }]],
		["b", [{ calledFunction: "c" }]],
		["c", [{ calledFunction: "a" }]],
	]);
	const functionNames = new Set(["a", "b", "c"]);

	const cycles = detectCircularDependencies(callGraph, functionNames);

	expect(cycles.length).toBeGreaterThan(0);
	const cycle = cycles[0];
	expect(cycle).toContain("a");
	expect(cycle).toContain("b");
	expect(cycle).toContain("c");
});

test("detectCircularDependencies does not report self-recursion", () => {
	const callGraph = new Map([["a", [{ calledFunction: "a" }]]]);
	const functionNames = new Set(["a"]);

	const cycles = detectCircularDependencies(callGraph, functionNames);

	expect(cycles.length).toBe(0);
});

test("detectCircularDependencies ignores acyclic graphs", () => {
	const callGraph = new Map([
		["a", [{ calledFunction: "b" }]],
		["b", [{ calledFunction: "c" }]],
		["c", []],
	]);
	const functionNames = new Set(["a", "b", "c"]);

	const cycles = detectCircularDependencies(callGraph, functionNames);

	expect(cycles.length).toBe(0);
});

// ============ ast-node-visitors tests ============

test("categorizeNodes separates imports, functions, exports, and other", () => {
	const code = `import { x } from "lib";
function foo() {}
const bar = () => {};
const x = 42;
export { foo };`;
	const sourceFile = parseCode(code);

	const categorized = categorizeNodes(sourceFile);

	expect(categorized.imports).toHaveLength(1);
	expect(categorized.functions).toHaveLength(2);
	expect(categorized.exports).toHaveLength(1);
	expect(categorized.other).toHaveLength(1);
});

test("categorizeNodes identifies arrow functions in variable statements", () => {
	const code = `const foo = () => "result";
const bar = () => "another";
const baz = 42;`;
	const sourceFile = parseCode(code);

	const categorized = categorizeNodes(sourceFile);

	expect(categorized.functions).toHaveLength(2);
	expect(categorized.other).toHaveLength(1);
});

test("categorizeNodes handles mixed function declarations", () => {
	const code = `function decl() {}
const arrow = () => {};
const value = 10;`;
	const sourceFile = parseCode(code);

	const categorized = categorizeNodes(sourceFile);

	expect(categorized.functions).toHaveLength(2);
	expect(categorized.other).toHaveLength(1);
});

test("reconstructStatements rebuilds file in import-other-function-export order", () => {
	const code = `import { x } from "lib";
function foo() { bar(); }
const y = 42;
function bar() {}
export { foo };`;
	const sourceFile = parseCode(code);

	const categorized = categorizeNodes(sourceFile);
	const reordered = categorized.functions.reverse(); // reverse for testing

	const reconstructed = reconstructStatements(categorized, reordered);

	const firstNode = reconstructed[0];
	if (!firstNode) {
		throw new Error("Expected reconstructed statements");
	}
	// First should be imports
	expect(ts.isImportDeclaration(firstNode)).toBe(true);
	// Last should be exports
	const lastNode = reconstructed.at(-1);
	expect(lastNode && ts.isExportDeclaration(lastNode)).toBe(true);
});

test("visitAllNodes visits every node in tree", () => {
	const code = "function foo(x) { return x + 1; }";
	const sourceFile = parseCode(code);
	const visited: ts.SyntaxKind[] = [];

	visitAllNodes(sourceFile, (node) => {
		visited.push(node.kind);
	});

	// Should have visited many nodes
	expect(visited.length).toBeGreaterThan(5);
	expect(visited).toContain(ts.SyntaxKind.FunctionDeclaration);
});

test("findNodes finds all nodes matching predicate", () => {
	const code = "const x = 1; const y = 2; const z = 3;";
	const sourceFile = parseCode(code);

	const identifiers = findNodes(sourceFile, ts.isIdentifier);

	// Should find x, y, z at minimum
	expect(identifiers.length).toBeGreaterThanOrEqual(3);
});

test("findNodes returns empty array when no matches", () => {
	const code = "const x = 1;";
	const sourceFile = parseCode(code);

	const calls = findNodes(sourceFile, ts.isCallExpression);

	expect(calls).toHaveLength(0);
});

test("findFirstNode returns first matching node", () => {
	const code = "function foo() {} function bar() {}";
	const sourceFile = parseCode(code);

	const firstFunc = findFirstNode(sourceFile, ts.isFunctionDeclaration);

	if (firstFunc && ts.isFunctionDeclaration(firstFunc)) {
		expect(true).toBe(true); // Type-narrowed successfully
	} else {
		throw new Error("Expected function declaration");
	}
});

test("findFirstNode returns null when no match found", () => {
	const code = "const x = 1;";
	const sourceFile = parseCode(code);

	const result = findFirstNode(sourceFile, ts.isCallExpression);

	expect(result).toBeNull();
});
