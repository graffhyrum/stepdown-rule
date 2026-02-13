// Nested function appears BEFORE return statement - VIOLATION
// @ts-ignore
function parent() {
	function helper() {
		return "I help";
	}

	console.log("doing something");
	return "done";
}
