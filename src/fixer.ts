import { Pipeline, type PipelineResult } from "./pipeline";
import type { RuleRegistry } from "./registry";
import { FileService } from "./services/FileService";
import type { IFileService } from "./services/types";
import type { Config, FixResult } from "./types";

export type { PipelineResult };
export { fixFileWithRules } from "./rule-fix";

export interface FixFilesParams {
	patterns: string[];
	config: Config;
	fileService?: IFileService;
	registry?: RuleRegistry;
	dryRun?: boolean;
	resolvedFiles?: string[];
}

/** @deprecated Use {@link FixFilesParams}. */
export type FixFilesOptions = Pick<FixFilesParams, "dryRun" | "resolvedFiles">;

export async function fixFiles(params: FixFilesParams): Promise<FixResult[]> {
	const { fixResults } = await runPipeline(params);
	return fixResults;
}

export async function runPipeline(params: FixFilesParams): Promise<PipelineResult> {
	const service = params.fileService ?? new FileService({ ignore: params.config.ignore });
	return Pipeline.run({
		patterns: params.patterns,
		config: params.config,
		fileService: service,
		registry: params.registry,
		mode: "fix",
		resolvedFiles: params.resolvedFiles,
		dryRun: params.dryRun,
	});
}

export { reorderTopLevelOnly } from "./stepdown-top-level-reorder";
