/**
 * Reusable graph algorithms for function dependency analysis.
 * Public: topologicalSort, detectCircularDependencies, findAndRemoveLeafFunctions.
 */

interface SortContext {
	dependencies: Map<string, string[]>;
	visited: Set<string>;
	temp: Set<string>;
	result: string[];
	sourceOrder: Map<string, number>;
}

interface CircularDepsContext {
	cycles: string[][];
	visited: Set<string>;
	recursionStack: Set<string>;
	path: string[];
	callGraph: Map<string, Array<{ calledFunction: string }>>;
}

/**
 * Perform topological sort on a dependency graph using DFS with cycle detection.
 * Returns functions in order where dependencies come before dependents.
 * Functions in cycles are placed at end in source order.
 */
export function topologicalSort(
	dependencies: Map<string, string[]>,
	sourceOrder: Map<string, number>,
): string[] {
	const visited = new Set<string>();
	const temp = new Set<string>();
	const result: string[] = [];

	const names = [...dependencies.keys()].sort(
		(a, b) => (sourceOrder.get(a) ?? 999) - (sourceOrder.get(b) ?? 999),
	);

	for (const name of names) {
		if (!visited.has(name)) {
			visitDependencyNode(name, { dependencies, visited, temp, result, sourceOrder });
		}
	}

	const unvisited = names.filter((name) => !visited.has(name));
	result.push(...unvisited);

	return result;
}

/**
 * Find leaf functions (no outgoing edges) without mutating the input map.
 * Returns leaf names (source order) and a new map of remaining dependencies.
 */
export function findAndRemoveLeafFunctions(
	dependencies: Map<string, string[]>,
	sourceOrder: Map<string, number>,
): { leafNames: string[]; remaining: Map<string, string[]> } {
	const remaining = new Map([...dependencies].map(([k, v]): [string, string[]] => [k, [...v]]));
	const leafNames: string[] = [];

	for (const [name, deps] of remaining) {
		if (deps.length === 0) {
			leafNames.push(name);
		}
	}

	for (const name of leafNames) {
		remaining.delete(name);
	}

	leafNames.sort((a, b) => (sourceOrder.get(a) ?? 999) - (sourceOrder.get(b) ?? 999));

	return { leafNames, remaining };
}

/**
 * Detect all circular dependencies in a call graph.
 * Returns list of cycles, where each cycle is a list of function names.
 */
export function detectCircularDependencies(
	callGraph: Map<string, Array<{ calledFunction: string }>>,
	functionNames: Set<string>,
): string[][] {
	const context: CircularDepsContext = {
		cycles: [],
		visited: new Set<string>(),
		recursionStack: new Set<string>(),
		path: [],
		callGraph,
	};

	for (const funcName of functionNames) {
		if (!context.visited.has(funcName)) {
			dfsDetectCycle(funcName, context);
		}
	}

	return context.cycles;
}

function visitDependencyNode(name: string, context: SortContext): void {
	if (context.temp.has(name)) {
		return;
	}
	if (context.visited.has(name)) {
		return;
	}

	context.temp.add(name);
	const deps = context.dependencies.get(name) || [];
	const orderedDeps = [...deps].sort(
		(a, b) => (context.sourceOrder.get(a) ?? 999) - (context.sourceOrder.get(b) ?? 999),
	);

	for (const dep of orderedDeps) {
		if (context.dependencies.has(dep)) {
			visitDependencyNode(dep, context);
		}
	}

	context.temp.delete(name);
	context.visited.add(name);
	context.result.push(name);
}

function dfsDetectCycle(funcName: string, context: CircularDepsContext): void {
	if (context.recursionStack.has(funcName)) {
		const cycle = extractCycle(funcName, context);
		if (isValidCycle(cycle)) {
			context.cycles.push(cycle);
		}
		return;
	}

	if (context.visited.has(funcName)) {
		return;
	}

	context.visited.add(funcName);
	context.recursionStack.add(funcName);
	context.path.push(funcName);

	const callSites = context.callGraph.get(funcName) || [];
	for (const { calledFunction } of callSites) {
		dfsDetectCycle(calledFunction, context);
	}

	context.recursionStack.delete(funcName);
	context.path.pop();
}

function extractCycle(funcName: string, context: CircularDepsContext): string[] {
	const cycleStart = context.path.indexOf(funcName);
	return [...context.path.slice(cycleStart), funcName];
}

function isValidCycle(cycle: string[]): boolean {
	return cycle.length > 2 || (cycle.length === 2 && cycle[0] !== cycle[1]);
}
