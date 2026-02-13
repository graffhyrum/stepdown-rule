/**
 * uj1: Each analysis (violation type) must have a fix implementation.
 * When adding a new violation type to the analyzer, add it here and provide a fixture.
 */
export const ACTIONABLE_VIOLATION_TYPES = ["stepdown", "nested"] as const;

export type ViolationType = (typeof ACTIONABLE_VIOLATION_TYPES)[number];

const FIXTURES: Record<ViolationType, string> = {
	stepdown: `function helper() { return "h"; }
function main() { return helper(); }`,
	nested: `function helper() { return "h"; }
function main() { return helper(); }

function parent() {
  function nestedHelper() { return "h"; }
  console.log("logic");
  return "done";
}`,
};

export function getViolationFixture(type: ViolationType): string {
	return FIXTURES[type];
}
