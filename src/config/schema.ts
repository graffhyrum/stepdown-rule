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
