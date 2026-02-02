// Test file with circular dependencies

function functionA() {
	console.log("A calls B");
	functionB();
}

function functionB() {
	console.log("B calls C");
	functionC();
}

function functionC() {
	console.log("C calls A");
	functionA(); // Creates circular dependency
}
