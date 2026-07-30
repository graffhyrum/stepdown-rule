import type { ViolationRule } from "./rule-context";

export interface RuleRegistry {
	register(rule: ViolationRule): void;
	getEnabled(ids?: string[]): ViolationRule[];
	list(): ViolationRule[];
	clear(): void;
}

export function createRegistry(): RuleRegistry {
	const rules: ViolationRule[] = [];
	return {
		register(rule: ViolationRule): void {
			rules.push(rule);
		},
		getEnabled(ids?: string[]): ViolationRule[] {
			if (ids === undefined) {
				return [...rules];
			}
			const set = new Set(ids);
			return rules.filter((r) => set.has(r.id));
		},
		list(): ViolationRule[] {
			return [...rules];
		},
		clear(): void {
			rules.length = 0;
		},
	};
}

const defaultRegistry = createRegistry();

export function register(rule: ViolationRule): void {
	defaultRegistry.register(rule);
}

export function getEnabled(ids?: string[]): ViolationRule[] {
	return defaultRegistry.getEnabled(ids);
}

export function list(): ViolationRule[] {
	return defaultRegistry.list();
}

/** Empty the process-local default registry. Tests should call this for isolation. */
export function clear(): void {
	defaultRegistry.clear();
}
