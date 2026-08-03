import { analyzeWithRules } from "./analyzer";
import { getEnabled, type RuleRegistry } from "./registry";
import { fixFileWithRules } from "./rule-fix";
import type { ViolationRule } from "./rule-context";
import type { IFileService } from "./services/types";
import type { AnalysisResult, Config, FixResult } from "./types";

export interface PipelineResult {
	analysisResults: AnalysisResult[];
	fixResults: FixResult[];
}

export type PipelineMode = "analyze" | "fix";

export interface PipelineRunOptions {
	patterns: string[];
	config: Config;
	fileService: IFileService;
	registry?: RuleRegistry;
	mode: PipelineMode;
	resolvedFiles?: string[];
	dryRun?: boolean;
}

/**
 * Canonical analyze/fix entry (`src/pipeline.ts`).
 * Owns Resolved→Parsed→Analyzed→Fixed per file.
 * Mode is the only analyze/fix switch — config has no fix flag.
 */
export const Pipeline = {
	async run(options: PipelineRunOptions): Promise<PipelineResult> {
		const { patterns, fileService, registry, mode, resolvedFiles, dryRun = false } = options;
		const { enabledRuleIds } = options.config;
		const files = resolvedFiles ?? (await fileService.resolveFiles(patterns));
		const enabledRules = registry
			? registry.getEnabled(enabledRuleIds)
			: getEnabled(enabledRuleIds);
		const shouldFix = mode === "fix";
		const analysisResults: AnalysisResult[] = [];
		const fixResults: FixResult[] = [];
		// Sequential: preserve order and avoid partial multi-file writes on hard failures.
		for (const filePath of files) {
			const { analysisResult, fixResult } = await processOneFile({
				filePath,
				service: fileService,
				enabledRules,
				dryRun,
				shouldFix,
			});
			analysisResults.push(analysisResult);
			if (shouldFix && fixResult) {
				fixResults.push(fixResult);
			}
		}
		return { analysisResults, fixResults };
	},
};

async function processOneFile(params: {
	filePath: string;
	service: IFileService;
	enabledRules: ViolationRule[];
	dryRun: boolean;
	shouldFix: boolean;
}): Promise<{
	analysisResult: AnalysisResult;
	fixResult: FixResult | null;
}> {
	const { filePath, service, enabledRules, dryRun, shouldFix } = params;
	const parsedFile = await service.parseFile(filePath);
	const analysisResult = analyzeWithRules(parsedFile, enabledRules);
	if (!shouldFix) {
		return { analysisResult, fixResult: null };
	}
	if (
		analysisResult.violations.length === 0 &&
		analysisResult.nestedFunctionViolations.length === 0
	) {
		return { analysisResult, fixResult: noOpFixResult(filePath, parsedFile.content) };
	}
	try {
		const result = fixFileWithRules({
			filePath,
			originalContent: parsedFile.content,
			enabledRules,
			service,
		});
		if (result.fixed && !dryRun) {
			await service.writeFile(filePath, result.fixedContent);
		}
		return { analysisResult, fixResult: result };
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		return {
			analysisResult,
			fixResult: noOpFixResult(filePath, parsedFile.content, [errorMessage]),
		};
	}
}

function noOpFixResult(filePath: string, content: string, errors: string[] = []): FixResult {
	return {
		file: filePath,
		fixed: false,
		originalContent: content,
		fixedContent: content,
		reordered: 0,
		errors,
	};
}
