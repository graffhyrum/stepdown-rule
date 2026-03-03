import "../src/register-default-rules";
import { expect, test } from "bun:test";
import { list } from "../src/registry";
import {
	ACTIONABLE_VIOLATION_TYPES,
	getViolationFixture,
	type ViolationType,
} from "../src/violation-coverage";
import { assertFixReducesViolations, defaultConfig } from "./helpers";

test("vic: pipeline uses registry; each actionable rule has fix coverage", async () => {
	const ruleIds = new Set(list().map((r) => r.id));
	const enabledRuleIds = [...ACTIONABLE_VIOLATION_TYPES];
	for (const id of enabledRuleIds) {
		expect(ruleIds.has(id), `registry should have rule ${id}`).toBe(true);
	}
	for (const violationType of ACTIONABLE_VIOLATION_TYPES) {
		const fixture = getViolationFixture(violationType as ViolationType);
		const config = { ...defaultConfig, enabledRuleIds };
		await assertFixReducesViolations(fixture, config, violationType);
	}
});
