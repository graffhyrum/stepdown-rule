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
import { cleanupTempDir, createTempDir, createTestFile } from "./helpers";

test("vic: pipeline uses registry; each actionable rule has fix coverage", async () => {
	const rules = list();
	const ruleIds = new Set(rules.map((r) => r.id));
	const enabledRuleIds = [...ACTIONABLE_VIOLATION_TYPES];
	for (const id of enabledRuleIds) {
		expect(ruleIds.has(id), `registry should have rule ${id}`).toBe(true);
	}
	for (const violationType of ACTIONABLE_VIOLATION_TYPES) {
		const fixture = getViolationFixture(violationType as ViolationType);
		const dir = createTempDir(`vic-${violationType}`);
		try {
			const file = await createTestFile(dir, "test.ts", fixture);
			const config = {
				ignore: [] as string[],
				analyzeArrowFunctions: true,
				analyzeExportsOnly: false,
				reportCircularDependencies: true,
				fix: false,
				json: false,
				enabledRuleIds,
			};
			const [before] = await analyzeFiles([file], config);
			const violationsBefore =
				(before?.violations.length ?? 0) + (before?.nestedFunctionViolations.length ?? 0);
			expect(
				violationsBefore,
				`${violationType} fixture must produce violations via pipeline`,
			).toBeGreaterThan(0);

			await fixFiles([file], { ...config, fix: true });

			const [after] = await analyzeFiles([file], config);
			const violationsAfter =
				(after?.violations.length ?? 0) + (after?.nestedFunctionViolations.length ?? 0);
			expect(violationsAfter).toBeLessThan(violationsBefore);
		} finally {
			cleanupTempDir(dir);
		}
	}
});
