// Test file for stepdown rule analysis
// This file contains violations: callees appear ABOVE callers

function hashPassword(password: string): string {
	return `hashed_${password}`;
}

function validateEmail(email: string): boolean {
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function createUser(email: string, password: string) {
	const hashed = hashPassword(password);
	return { email, password: hashed };
}

function _main() {
	console.log("Starting execution");
	const user = createUser("john@example.com", "password123");
	const isValid = validateEmail(user.email);
	if (!isValid) {
		throw new Error("Invalid email format");
	}
	return user;
}

// Arrow function violations: callee above caller
const cleanData = (data: string): string => {
	return data.trim();
};

const _processData = (data: string) => {
	const cleaned = cleanData(data);
	return cleaned.toUpperCase();
};
