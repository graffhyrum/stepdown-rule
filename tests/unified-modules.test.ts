import { expect, test } from "bun:test";
import ts from "typescript";
import {
	buildCallGraph,
	buildDependencyGraph,
	callGraphToDependencyMap,
	extractDependenciesFor,
	extractFunctionName,
	extractFunctionNames,
	findContainingFunction,
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
	filterOutCyclicFunctions,
	findAndRemoveLeafFunctions,
	topologicalSort,
	visitDependencyNode,
} from "../src/graph-algorithms";
import type { FunctionInfo } from "../src/types";

const parseCode = (code: string) =>
	parseCode(code);

// ============ ast-graph-builder tests ============

test("extractFunctionNames extracts all function names from FunctionInfo array", () => {
	const funcs: FunctionInfo[] = [
		{
			name: "foo",
			parentFunction: null,
			position: { start: 0, line: 1 },
		},
		{
			name: "bar",
			parentFunction: null,
			position: { start: 10, line: 2 },
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
	const funcNode = sourceFile.statements[0];

	const name = extractFunctionName(funcNode, sourceFile);
	expect(name).toBe("hello");
});

test("extractFunctionName extracts from arrow function variable statement", () => {
	const code = "const myFunc = () => 'test';";
	const sourceFile = parseCode(code);
	const varNode = sourceFile.statements[0];

	const name = extractFunctionName(varNode, sourceFile);
	expect(name).toBe("myFunc");
});

test("extractFunctionName returns name even for non-function variable (delegates filtering to caller)", () => {
	const code = "const x = 42;";
	const sourceFile = parseCode(code);
	const varNode = sourceFile.statements[0];

	const name = extractFunctionName(varNode, sourceFile);
	// extractFunctionName returns the identifier name; caller is responsible for checking if it's a function
	expect(name).toBe("x");
});

test("buildDependencyGraph creates mapping of functions to their dependencies", () => {
	const code = `function a() { b(); }
function b() { return 'done'; }`;
	const sourceFile = parseCode(code);
	const funcNodes = sourceFile.statements.map((s) => ({ node: s, info: null }));

	const graph = buildDependencyGraph(funcNodes, sourceFile);

	expect(graph.functionNames.has("a")).toBe(true);
	expect(graph.functionNames.has("b")).toBe(true);
	expect(graph.dependencies.get("a")).toEqual(["b"]);
	expect(graph.dependencies.get("b")).toEqual([]);
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
	const mainNode = sourceFile.statements[0];

	const funcNames = new Map([
		["a", sourceFile.statements[1]],
		["b", sourceFile.statements[2]],
		["c", sourceFile.statements[3]],
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
	const mainNode = sourceFile.statements[0];

	const funcNames = new Map([["a", sourceFile.statements[1]]]);

	const deps = extractDependenciesFor(mainNode, sourceFile, funcNames);
	expect(deps).toEqual(["a"]);
});

test("buildCallGraph creates call graph with function call locations", () => {
	const code = `function main() { helper(); }
function helper() { return 'test'; }`;
	const sourceFile = parseCode(code);

	const funcs: FunctionInfo[] = [
		{ name: "main", parentFunction: null, position: { start: 0, line: 1 } },
		{ name: "helper", parentFunction: null, position: { start: 30, line: 2 } },
	];

	const callGraph = buildCallGraph(funcs, sourceFile);

	expect(callGraph.has("main")).toBe(true);
	expect(callGraph.has("helper")).toBe(true);
	expect(callGraph.get("main")).toHaveLength(1);
	expect(callGraph.get("main")?.[0]?.calledFunction).toBe("helper");
});

test("findContainingFunction identifies parent function of call expression", () => {
	const code = `function outer() { inner(); }
function inner() {}`;
	const sourceFile = parseCode(code);

	// Find the call expression (inner())
	let callNode: ts.Node | null = null;
	function findCall(node: ts.Node) {
		if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
			callNode = node;
		}
		ts.forEachChild(node, findCall);
	}
	findCall(sourceFile);

	if (!callNode) {
		throw new Error("Call node not found");
	}
	const container = findContainingFunction(callNode, sourceFile);
	expect(container).toBe("outer");
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

	const leaves = findAndRemoveLeafFunctions(deps, sourceOrder);

	expect(leaves).toContain("b");
	expect(leaves).toContain("c");
	expect(deps.has("b")).toBe(false);
	expect(deps.has("c")).toBe(false);
	expect(deps.has("a")).toBe(true);
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

	const leaves = findAndRemoveLeafFunctions(deps, sourceOrder);

	expect(leaves[0]).toBe("c"); // c before b
	expect(leaves[1]).toBe("b");
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

test("filterOutCyclicFunctions removes functions in cycles", () => {
	const functionNames = new Set(["a", "b", "c", "d"]);
	const cycles = [["a", "b"]];

	const acyclic = filterOutCyclicFunctions(functionNames, cycles);

	expect(acyclic.has("a")).toBe(false);
	expect(acyclic.has("b")).toBe(false);
	expect(acyclic.has("c")).toBe(true);
	expect(acyclic.has("d")).toBe(true);
});

test("visitDependencyNode performs DFS visit and adds to result", () => {
	const context = {
		dependencies: new Map([
			["a", ["b"]],
			["b", ["c"]],
			["c", []],
		]),
		visited: new Set<string>(),
		temp: new Set<string>(),
		result: [] as string[],
		sourceOrder: new Map([
			["a", 0],
			["b", 1],
			["c", 2],
		]),
	};

	visitDependencyNode("a", context);

	expect(context.visited.has("a")).toBe(true);
	expect(context.result).toContain("a");
	expect(context.result).toContain("b");
	expect(context.result).toContain("c");
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

test("reconstructStatements rebuilds file in import-function-other-export order", () => {
	const code = `import { x } from "lib";
function foo() { bar(); }
const y = 42;
function bar() {}
export { foo };`;
	const sourceFile = parseCode(code);

	const categorized = categorizeNodes(sourceFile);
	const reordered = categorized.functions.reverse(); // reverse for testing

	const reconstructed = reconstructStatements(categorized, reordered);

	// First should be imports
	expect(ts.isImportDeclaration(reconstructed[0])).toBe(true);
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
