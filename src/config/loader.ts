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

	let fileContent: string;
	try {
		fileContent = await Bun.file(configPath).text();
	} catch (error) {
		if (isMissingFileError(error)) {
			return defaultConfig;
		}
		throw error;
	}

	let raw: unknown;
	try {
		raw = JSON.parse(fileContent);
	} catch (error) {
		if (error instanceof SyntaxError) {
			throw new Error(`Invalid JSON in config file: ${error.message}`);
		}
		throw error;
	}

	const result = FileConfigSchema(raw);
	if (result instanceof type.errors) {
		throw new Error(`Config validation failed: ${result.toString()}`);
	}
	return result;
}

function isMissingFileError(error: unknown): boolean {
	if (!(error instanceof Error)) return false;
	if ("code" in error && typeof error.code === "string") {
		return error.code === "ENOENT";
	}
	// Bun sometimes surfaces missing files without Node-style codes.
	return /ENOENT|no such file|NotFound/i.test(error.message);
}
