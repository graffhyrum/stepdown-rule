/**
 * vic: Pipeline uses registry; uj1 still enforces fix coverage per rule.
 * Runs with rules registered (register-default-rules) and exercises --rules path.
 */
import "../src/register-default-rules";
import { expect, test } from "bun:test";
import { analyzeFiles } from "../src/analyzer";
import { fixFiles } from "../src/fixer";
import { list } from "../src/registry";
import {
	ACTIONABLE_VIOLATION_TYPES,
	getViolationFixture,
	type ViolationType,
} from "../src/violation-coverage";
import { defaultConfig, totalViolations, withTempFile } from "./helpers";

test("vic: pipeline uses registry; each actionable rule has fix coverage", async () => {
	const rules = list();
	const ruleIds = new Set(rules.map((r) => r.id));
	const enabledRuleIds = [...ACTIONABLE_VIOLATION_TYPES];
	for (const id of enabledRuleIds) {
		expect(ruleIds.has(id), `registry should have rule ${id}`).toBe(true);
	}
	for (const violationType of ACTIONABLE_VIOLATION_TYPES) {
		const fixture = getViolationFixture(violationType as ViolationType);
		await withTempFile(fixture, async (file) => {
			const config = { ...defaultConfig, enabledRuleIds };
			const [before] = await analyzeFiles([file], config);
			const violationsBefore = totalViolations(before);
			expect(
				violationsBefore,
				`${violationType} fixture must produce violations via pipeline`,
			).toBeGreaterThan(0);

			await fixFiles([file], { ...config, fix: true });

			const [after] = await analyzeFiles([file], config);
			const violationsAfter = totalViolations(after);
			expect(violationsAfter).toBeLessThan(violationsBefore);
		});
	}
});
