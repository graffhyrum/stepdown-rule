import { type } from "arktype";
import { type FileConfig, FileConfigSchema } from "./schema";

export async function loadConfig(configPath?: string): Promise<FileConfig> {
	const defaultResult = FileConfigSchema({});
	if (defaultResult instanceof type.errors) {
		throw new Error(`Default config invalid: ${defaultResult.toString()}`);
	}
	const defaultConfig: FileConfig = defaultResult;

	if (!configPath) {
		return defaultConfig;
	}

	try {
		const fileContent = await Bun.file(configPath).text();
		const raw: unknown = JSON.parse(fileContent);
		const result = FileConfigSchema(raw);
		if (result instanceof type.errors) {
			throw new Error(`Config validation failed: ${result.toString()}`);
		}
		return result;
	} catch (error) {
		if (isMissingFileError(error)) {
			return defaultConfig;
		}
		if (error instanceof SyntaxError) {
			throw new Error(`Invalid JSON in config file: ${error.message}`);
		}
		throw error;
	}
}

function isMissingFileError(error: unknown): boolean {
	if (!(error instanceof Error)) return false;
	if ("code" in error && typeof error.code === "string") {
		return error.code === "ENOENT";
	}
	// Bun sometimes surfaces missing files without Node-style codes.
	return /ENOENT|no such file|NotFound/i.test(error.message);
}
