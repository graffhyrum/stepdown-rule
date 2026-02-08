// Test file with correct stepdown ordering - no violations
// Callers appear ABOVE callees (high-level first, low-level last)

function _main() {
	console.log("Starting execution");
	const user = createUser("john@example.com", "password123");
	const isValid = validateEmail(user.email);
	if (!isValid) {
		throw new Error("Invalid email format");
	}
	return user;
}

function createUser(email: string, password: string) {
	const hashed = hashPassword(password);
	return { email, password: hashed };
}

function validateEmail(email: string): boolean {
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function hashPassword(password: string): string {
	return `hashed_${password}`;
}

// Arrow functions in correct order (caller above callee)
const _processData = (data: string) => {
	const cleaned = cleanData(data);
	return cleaned.toUpperCase();
};

const cleanData = (data: string): string => {
	return data.trim();
};
