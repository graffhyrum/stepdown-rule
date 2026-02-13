// FM4/1e0: Factory returns object with METHOD that calls helper - dep inside method body
const loadConfig = () => ({});
const createService = () => ({
	init() {
		loadConfig();
	},
});
