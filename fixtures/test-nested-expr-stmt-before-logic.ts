// ExpressionStatement-wrapped call: nested decl before logic inside callback
// @ts-ignore
const run = (name: string, fn: () => void) => fn();
run("suite", () => {
	function helper() {
		return 42;
	}
	console.log("logic");
});
