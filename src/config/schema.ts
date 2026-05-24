import { type } from "arktype";

export const FileConfigSchema = type({
	ignore: ["string[]", "=", () => []],
});

export type FileConfig = typeof FileConfigSchema.infer;

export const FileConfigJsonSchema = FileConfigSchema.toJsonSchema();

export const ConfigSchema = type({
	ignore: ["string[]", "=", () => []],
	fix: ["boolean", "=", false],
	json: ["boolean", "=", false],
	enabledRuleIds: "string[]?",
});

export type Config = typeof ConfigSchema.infer;

export const ConfigJsonSchema = ConfigSchema.toJsonSchema();

export const CliErrorSchema = type({
	code: "'CONFIG_ERROR' | 'NO_FILES' | 'USAGE' | 'INTERNAL_ERROR'",
	message: "string",
	hint: "string?",
});

export const AgentsAnalyzeSummarySchema = type({
	files: "number",
	violations: "number",
	circularDependencies: "number",
});

export const AgentsFixSummarySchema = type({
	files: "number",
	fixed: "number",
	failed: "number",
});

export const AgentsFixResultSchema = type({
	file: "string",
	fixed: "boolean",
	reordered: "number",
	errors: "string[]",
	preview: "string?",
	originalContent: "string?",
	fixedContent: "string?",
});

export const AgentsAnalyzeEnvelopeSchema = type({
	schemaVersion: "number",
	command: "string",
	ok: "boolean",
	exitCode: "number",
	summary: AgentsAnalyzeSummarySchema,
	results: "unknown[]",
	errors: CliErrorSchema.array(),
});

export const AgentsFixEnvelopeSchema = type({
	schemaVersion: "number",
	command: "string",
	ok: "boolean",
	exitCode: "number",
	summary: AgentsFixSummarySchema,
	results: AgentsFixResultSchema.array(),
	errors: CliErrorSchema.array(),
});

export const AgentsAnalyzeEnvelopeJsonSchema = AgentsAnalyzeEnvelopeSchema.toJsonSchema();
export const AgentsFixEnvelopeJsonSchema = AgentsFixEnvelopeSchema.toJsonSchema();
