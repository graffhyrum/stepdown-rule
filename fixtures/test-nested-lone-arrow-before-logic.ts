// Lone nested const-arrow before logic — detect + fix must converge in one pass
// @ts-ignore
function parent() {
	const helper = () => "I help";
	console.log("doing something");
	return "done";
}
