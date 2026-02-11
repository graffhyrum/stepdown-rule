// Nested function declaration appears BEFORE logic - SHOULD trigger violation
// Rule 1: Logic should come before function declarations within any scope
export function _sideEffect() {
	function helper() {
		console.log("helping");
	}

	helper();
}
