// Lone nested FunctionDeclaration before logic — detect + fix must converge in one pass
// @ts-ignore
function parent() {
	function helper() {
		return "I help";
	}
	console.log("doing something");
	return "done";
}
