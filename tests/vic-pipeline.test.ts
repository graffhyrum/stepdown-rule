import { beforeAll, expect, test } from "bun:test";
import { registerDefaultRules } from "../src/register-default-rules";
import { clear, list } from "../src/registry";
import { ACTIONABLE_VIOLATION_TYPES } from "../src/violation-coverage";

beforeAll(() => {
	clear();
	registerDefaultRules();
});

test("vic: registry has every actionable violation rule id", () => {
	const ruleIds = new Set(list().map((r) => r.id));
	for (const id of ACTIONABLE_VIOLATION_TYPES) {
		expect(ruleIds.has(id), `registry should have rule ${id}`).toBe(true);
	}
});
