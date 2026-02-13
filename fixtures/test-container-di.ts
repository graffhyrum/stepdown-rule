// FM3/FM4: Multi-level DI - createMockServices calls createServices calls createSurrealServices.
// Fixing one level can flip violations at another level.
const createSurrealRepositories = () => ({});
const createSurrealServices = () => ({
	repos: createSurrealRepositories(),
});
const createInMemoryRepositories = () => ({});
const createInMemoryServices = () => ({
	repos: createInMemoryRepositories(),
});
const createServices = () => ({
	surreal: createSurrealServices(),
	inMemory: createInMemoryServices(),
});
const createMockServices = () => createServices();
