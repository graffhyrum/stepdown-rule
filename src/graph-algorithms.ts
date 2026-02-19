/**
 * Reusable graph algorithms for function dependency analysis.
 * Consolidates topological sorting, cycle detection, and path finding.
 */

export interface SortContext {
	dependencies: Map<string, string[]>;
	visited: Set<string>;
	temp: Set<string>;
	result: string[];
	sourceOrder: Map<string, number>;
}

export interface CircularDepsContext {
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

	// Add unvisited functions (from cycles) in source order
	const unvisited = names.filter((name) => !visited.has(name));
	result.push(...unvisited);

	return result;
}

/**
 * DFS visit for topological sort.
 * Handles cycle detection by tracking temp set.
 */
export function visitDependencyNode(name: string, context: SortContext): void {
	if (context.temp.has(name)) {
		// Cycle detected - skip to allow partial ordering
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
		// Only visit if dependency is still in graph (not a removed leaf)
		if (context.dependencies.has(dep)) {
			visitDependencyNode(dep, context);
		}
	}

	context.temp.delete(name);
	context.visited.add(name);
	context.result.push(name);
}

/**
 * Find and remove leaf functions (no outgoing edges) from dependency map.
 * Leaf functions are returned in source order.
 */
export function findAndRemoveLeafFunctions(
	dependencies: Map<string, string[]>,
	sourceOrder: Map<string, number>,
): string[] {
	const leafNames: string[] = [];

	// Identify leaves
	for (const [name, deps] of dependencies) {
		if (deps.length === 0) {
			leafNames.push(name);
		}
	}

	// Remove from dependency map
	for (const name of leafNames) {
		dependencies.delete(name);
	}

	// Sort by source order
	leafNames.sort((a, b) => (sourceOrder.get(a) ?? 999) - (sourceOrder.get(b) ?? 999));

	return leafNames;
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

/**
 * DFS for cycle detection.
 */
function dfsDetectCycle(funcName: string, context: CircularDepsContext): boolean {
	if (context.recursionStack.has(funcName)) {
		const cycle = extractCycle(funcName, context);
		if (isValidCycle(cycle)) {
			context.cycles.push(cycle);
		}
		return true;
	}

	if (context.visited.has(funcName)) {
		return false;
	}

	context.visited.add(funcName);
	context.recursionStack.add(funcName);
	context.path.push(funcName);

	const callSites = context.callGraph.get(funcName) || [];
	for (const { calledFunction } of callSites) {
		if (dfsDetectCycle(calledFunction, context)) {
			return true;
		}
	}

	context.recursionStack.delete(funcName);
	context.path.pop();
	return false;
}

/**
 * Extract a cycle from the path when a back-edge is found.
 */
function extractCycle(funcName: string, context: CircularDepsContext): string[] {
	const cycleStart = context.path.indexOf(funcName);
	return [...context.path.slice(cycleStart), funcName];
}

/**
 * Validate that a cycle is not self-recursive.
 */
function isValidCycle(cycle: string[]): boolean {
	// Skip "A → A → A" style cycles
	return cycle.length > 2 || (cycle.length === 2 && cycle[0] !== cycle[1]);
}

/**
 * Filter violations to exclude those involving functions in cycles.
 */
export function filterOutCyclicFunctions(
	functionNames: Set<string>,
	circularDependencies: string[][],
): Set<string> {
	const functionsInCycles = new Set(circularDependencies.flat());
	return new Set([...functionNames].filter((name) => !functionsInCycles.has(name)));
}
