import { beforeAll, test } from "bun:test";
import { registerDefaultRules } from "../src/register-default-rules";
import { clear } from "../src/registry";
import { ACTIONABLE_VIOLATION_TYPES, getViolationFixture } from "../src/violation-coverage";
import { assertFixReducesViolations, fixConfig } from "./helpers";

beforeAll(() => {
	clear();
	registerDefaultRules();
});

test("uj1: each actionable violation type has fix coverage", () => {
	for (const violationType of ACTIONABLE_VIOLATION_TYPES) {
		const fixture = getViolationFixture(violationType);
		assertFixReducesViolations(fixture, fixConfig, violationType);
	}
});
