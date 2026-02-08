// Nested function appears AFTER return statement - CORRECT
// @ts-ignore
function parent() {
	const result = helper();
	return result;

	function helper() {
		return "I help";
	}
}
