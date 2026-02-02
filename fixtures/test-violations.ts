// Test file for stepdown rule analysis
// This file contains violations that should be detected

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

// This should be a violation - validateEmail is called before it's declared
function validateEmail(email: string): boolean {
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function hashPassword(password: string): string {
	return `hashed_${password}`;
}

// Arrow function that should also follow stepdown rule
const _processData = (data: string) => {
	const cleaned = cleanData(data);
	return cleaned.toUpperCase();
};

const cleanData = (data: string): string => {
	return data.trim();
};
