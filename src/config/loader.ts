import { type } from "arktype";
import { FileConfigSchema } from "../config/schema";

export async function loadConfig(configPath?: string): Promise<typeof FileConfigSchema.infer> {
	const defaultConfig = {
		ignore: [],
		analyzeArrowFunctions: true,
		analyzeExportsOnly: false,
		reportCircularDependencies: true,
	};

	if (!configPath) {
		return defaultConfig;
	}

	try {
		const fileExists = await Bun.file(configPath).exists();
		if (!fileExists) {
			return defaultConfig;
		}

		const fileContent = await Bun.file(configPath).text();
		const config = JSON.parse(fileContent);

		const result = FileConfigSchema(config);
		if (result instanceof type.errors) {
			throw new Error(`Config validation failed: ${result.toString()}`);
		}

		return result;
	} catch (error) {
		if (error instanceof SyntaxError) {
			throw new Error(`Invalid JSON in config file: ${error.message}`);
		}
		throw error;
	}
}

export function getConfigJsonSchema(): object {
	return FileConfigSchema.toJsonSchema();
}

export async function getFullConfigJsonSchema(): Promise<object> {
	return (await import("../config/schema")).ConfigSchema.toJsonSchema();
}
