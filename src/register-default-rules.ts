import { nestedRule } from "./nested-rule";
import { clear, getEnabled, list, register, type RuleRegistry } from "./registry";
import { stepdownRule } from "./stepdown-rule";

/** Register stepdown + nested. Idempotent: skips ids already present. */
export function registerDefaultRules(registry?: RuleRegistry): void {
	const target: RuleRegistry = registry ?? { register, list, getEnabled, clear };
	const existing = new Set(target.list().map((r) => r.id));
	if (!existing.has(stepdownRule.id)) {
		target.register(stepdownRule);
	}
	if (!existing.has(nestedRule.id)) {
		target.register(nestedRule);
	}
}

registerDefaultRules();
