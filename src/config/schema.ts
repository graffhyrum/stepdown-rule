import { type } from "arktype";

export const FileConfigSchema = type({
	ignore: ["string[]", "=", () => []],
	analyzeArrowFunctions: ["boolean", "=", true],
	analyzeExportsOnly: ["boolean", "=", false],
	reportCircularDependencies: ["boolean", "=", true],
});

export type FileConfig = typeof FileConfigSchema.infer;

export const FileConfigJsonSchema = FileConfigSchema.toJsonSchema();

export const ConfigSchema = type({
	ignore: ["string[]", "=", () => []],
	analyzeArrowFunctions: ["boolean", "=", true],
	analyzeExportsOnly: ["boolean", "=", false],
	reportCircularDependencies: ["boolean", "=", true],
	fix: ["boolean", "=", false],
	json: ["boolean", "=", false],
	outputFile: "string?",
	enabledRuleIds: "string[]?",
});

export type Config = typeof ConfigSchema.infer;

export const ConfigJsonSchema = ConfigSchema.toJsonSchema();

export const ConfigDescriptions = {
	ignore: "Array of glob patterns to ignore when analyzing files",
	analyzeArrowFunctions: "Whether to analyze arrow functions for stepdown violations",
	analyzeExportsOnly: "Whether to only analyze exported functions",
	reportCircularDependencies: "Whether to report circular dependencies",
	fix: "Whether to automatically fix stepdown violations",
	json: "Whether to output results in JSON format",
	outputFile: "File path to write output to (if json is true)",
};
