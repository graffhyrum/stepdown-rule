// Multiple nested DECLARATIONS before return - VIOLATIONS
export function orchestrator() {
	const helperOne = () => "help1";

	const helperTwo = () => "help2";

	return {
		one: helperOne(),
		two: helperTwo(),
	};
}
