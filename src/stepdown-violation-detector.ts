import { detectCircularDependencies as detectCycles } from "./graph-algorithms";
import type { CallSiteInfo, RuleContext } from "./rule-context";
import type { FunctionInfo, StepdownViolation } from "./types";

export function findStepdownViolations(ctx: RuleContext): StepdownViolation[] {
	const violations = findViolations(ctx.functions, ctx.callGraph);
	const circular = detectCircularDependencies(ctx.functions, ctx.callGraph);
	return filterOutCircularViolations(violations, circular);
}

function findViolations(
	functions: FunctionInfo[],
	callGraph: Map<string, CallSiteInfo[]>,
): StepdownViolation[] {
	const violations: StepdownViolation[] = [];
	const topLevelFunctions = functions.filter((f) => f.parentFunction === null);
	for (const func of topLevelFunctions) {
		const violationsForFunction = findViolationsForFunction(func, functions, callGraph);
		violations.push(...violationsForFunction);
	}
	return violations;
}

function findViolationsForFunction(
	func: FunctionInfo,
	functions: FunctionInfo[],
	callGraph: Map<string, CallSiteInfo[]>,
): StepdownViolation[] {
	const violations: StepdownViolation[] = [];
	const callSites = callGraph.get(func.name) || [];
	for (const { calledFunction, callSite } of callSites) {
		if (calledFunction === func.name) {
			continue;
		}
		const depFunc = functions.find((f) => f.name === calledFunction);
		if (depFunc?.parentFunction !== null) {
			continue;
		}
		if (depFunc.position.line < func.position.line) {
			violations.push({
				kind: "stepdown",
				function: func,
				dependency: depFunc,
				message: `Stepdown violation: ${func.name} calls ${calledFunction} which appears above it`,
				callSite,
			});
		}
	}
	return violations;
}

function detectCircularDependencies(
	functions: FunctionInfo[],
	callGraph: Map<string, CallSiteInfo[]>,
): string[][] {
	const names = new Set(functions.map((f) => f.name));
	return detectCycles(callGraph, names);
}

function filterOutCircularViolations(
	violations: StepdownViolation[],
	circularDependencies: string[][],
): StepdownViolation[] {
	const cyclePairs = buildCyclePairs(circularDependencies);
	return violations.filter((v) => !cyclePairs.has(pairKey(v.function.name, v.dependency.name)));
}

function buildCyclePairs(cycles: string[][]): Set<string> {
	const pairs = new Set<string>();
	for (const cycle of cycles) {
		for (let i = 0; i < cycle.length - 1; i++) {
			const a = cycle[i];
			const b = cycle[i + 1];
			if (a && b) {
				pairs.add(pairKey(a, b));
				pairs.add(pairKey(b, a));
			}
		}
	}
	return pairs;
}

function pairKey(a: string, b: string): string {
	return `${a}\0${b}`;
}
