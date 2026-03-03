import { expect, test } from "bun:test";
import { analyzeFiles } from "../src/analyzer";
import { fixFiles } from "../src/fixer";
import { ACTIONABLE_VIOLATION_TYPES, getViolationFixture } from "../src/violation-coverage";
import { fixConfig, totalViolations, withTempFile } from "./helpers";

/**
 * uj1: Project rule - each analysis (violation type) must have a fix implementation.
 * When adding a new violation type to the analyzer, add fixer support and a fixture here.
 */
test("uj1: each actionable violation type has fix coverage", async () => {
	for (const violationType of ACTIONABLE_VIOLATION_TYPES) {
		const fixture = getViolationFixture(violationType);
		await withTempFile(fixture, async (file) => {
			const [before] = await analyzeFiles([file], fixConfig);
			const violationsBefore = totalViolations(before);
			expect(violationsBefore, `${violationType} fixture must produce violations`).toBeGreaterThan(
				0,
			);

			await fixFiles([file], fixConfig);

			const [after] = await analyzeFiles([file], fixConfig);
			const violationsAfter = totalViolations(after);
			expect(violationsAfter).toBeLessThan(violationsBefore);
		});
	}
});
