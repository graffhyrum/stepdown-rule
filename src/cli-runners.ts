import type { CliErrorPayload } from "./cli-errors";
import { loadConfig } from "./config/loader";
import type { FixFilesOptions } from "./fixer";
import { Pipeline } from "./pipeline";
import { FileService } from "./services/FileService";
import type { IFileService } from "./services/types";
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
export async function buildConfigFromCli(
	options: CliOptions & { format?: string },
): Promise<Config> {
	const fileConfig = await loadConfig(options.config);
	const enabledRuleIds = options.rules
		? options.rules
				.split(",")
				.map((s) => s.trim())
				.filter(Boolean)
		: undefined;
	const json = options.json === true || options.format === "json" || options.format === "agents";
	return {
		ignore: options.ignore ?? fileConfig.ignore,
		fix: false,
		json,
		enabledRuleIds,
	};
}
export async function resolvePatterns(
	fileService: IFileService,
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
	fileService?: IFileService,
	resolvedFiles?: string[],
): Promise<AnalysisResult[]> {
	const service = fileService ?? new FileService({ ignore: config.ignore });
	const { analysisResults } = await Pipeline.run({
		patterns,
		config,
		fileService: service,
		mode: "analyze",
		resolvedFiles,
	});
	return analysisResults;
}
export async function runFix(
	patterns: string[],
	config: Config,
	fileService?: IFileService,
	fixOptions: FixFilesOptions = {},
): Promise<FixResult[]> {
	const service = fileService ?? new FileService({ ignore: config.ignore });
	const { fixResults } = await Pipeline.run({
		patterns,
		config: { ...config, fix: true },
		fileService: service,
		mode: "fix",
		resolvedFiles: fixOptions.resolvedFiles,
		dryRun: fixOptions.dryRun,
	});
	return fixResults;
}
