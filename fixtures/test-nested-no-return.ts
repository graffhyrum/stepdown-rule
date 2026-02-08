// Nested function with no return statement - should not trigger violation
export function sideEffect() {
	function helper() {
		console.log("helping");
	}

	helper();
}
