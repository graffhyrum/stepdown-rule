// Nested arrow function before return - VIOLATION
function parent() {
	const helper = () => "I help";

	return helper();
}
