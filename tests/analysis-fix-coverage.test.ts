import { test } from "bun:test";
import { ACTIONABLE_VIOLATION_TYPES, getViolationFixture } from "../src/violation-coverage";
import { assertFixReducesViolations, fixConfig } from "./helpers";

test("uj1: each actionable violation type has fix coverage", async () => {
	for (const violationType of ACTIONABLE_VIOLATION_TYPES) {
		const fixture = getViolationFixture(violationType);
		await assertFixReducesViolations(fixture, fixConfig, violationType);
	}
});
