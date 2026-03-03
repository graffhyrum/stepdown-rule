import type { ViolationRule } from "./rule-context";

const rules: ViolationRule[] = [];

export function register(rule: ViolationRule): void {
	rules.push(rule);
}

export function getEnabled(ids?: string[]): ViolationRule[] {
	if (ids === undefined) {
		return [...rules];
	}
	const set = new Set(ids);
	return rules.filter((r) => set.has(r.id));
}

export function list(): ViolationRule[] {
	return [...rules];
}
