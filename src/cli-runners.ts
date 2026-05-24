import { analyzeFiles } from "./analyzer";
import type { CliErrorPayload } from "./cli-errors";
import { loadConfig } from "./config/loader";
import { fixFiles, type FixFilesOptions } from "./fixer";
import { FileService } from "./services/FileService";
import type { AnalysisResult, Config, FixResult } from "./types";
export interface CliOptions {
	ignore?: string[];
	json?: boolean;
	config?: string;
	rules?: string;
}
export async function buildConfigFromCliSafe(options: CliOptions): Promise<
	| {
			config: Config;
	  }
	| {
			error: CliErrorPayload;
	  }
> {
	try {
		const config = await buildConfigFromCli(options);
		return { config };
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return {
			error: {
				code: "CONFIG_ERROR",
				message,
				hint: "Fix .stepdownrc.json or pass --config with a valid JSON file.",
			},
		};
	}
}
export async function buildConfigFromCli(options: CliOptions): Promise<Config> {
	const fileConfig = await loadConfig(options.config);
	const enabledRuleIds = options.rules
		? options.rules
				.split(",")
				.map((s) => s.trim())
				.filter(Boolean)
		: undefined;
	return {
		ignore: options.ignore ?? fileConfig.ignore,
		fix: false,
		json: options.json ?? false,
		enabledRuleIds,
	};
}
export async function resolvePatterns(
	fileService: FileService,
	patterns: string[],
): Promise<
	| {
			files: string[];
	  }
	| {
			error: CliErrorPayload;
	  }
> {
	const files = await fileService.resolveFiles(patterns);
	if (files.length === 0) {
		return {
			error: {
				code: "NO_FILES",
				message: `No files matched: ${patterns.join(", ")}`,
				hint: "Quote globs for the shell, e.g. 'src/**/*.ts'. Check --ignore patterns.",
			},
		};
	}
	return { files };
}
export async function runAnalyze(
	patterns: string[],
	config: Config,
	fileService?: FileService,
	resolvedFiles?: string[],
): Promise<AnalysisResult[]> {
	const service = fileService ?? new FileService({ ignore: config.ignore });
	return analyzeFiles(patterns, config, service, resolvedFiles);
}
export async function runFix(
	patterns: string[],
	config: Config,
	fileService?: FileService,
	fixOptions: FixFilesOptions = {},
): Promise<FixResult[]> {
	const service = fileService ?? new FileService({ ignore: config.ignore });
	return fixFiles(patterns, { ...config, fix: true }, service, fixOptions);
}
