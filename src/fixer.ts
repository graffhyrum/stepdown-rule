import ts from "typescript";
import { buildDependencyGraph } from "./ast-graph-builder";
import { categorizeNodes } from "./ast-node-visitors";
import { transformNestedBlocks } from "./nested-block-transform";
import { Pipeline, type PipelineResult } from "./pipeline";
import type { RuleRegistry } from "./registry";
import { FileService } from "./services/FileService";
import type { IFileService } from "./services/types";
import { applyTopLevelReorder } from "./stepdown-top-level-reorder";
import type { AnalysisResult, Config, FixResult } from "./types";

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

const defaultPrinter = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });

/**
 * @deprecated Prefer {@link fixFileWithRules} via Pipeline (rule-based path).
 * Kept for characterization / legacy comparison tests only.
 */
export function fixParsedFile(params: {
	content: string;
	filePath: string;
	analysisResult?: AnalysisResult;
}): FixResult {
	const { content, filePath, analysisResult } = params;
	if (
		analysisResult &&
		analysisResult.violations.length === 0 &&
		analysisResult.nestedFunctionViolations.length === 0
	) {
		return {
			file: filePath,
			fixed: false,
			originalContent: content,
			fixedContent: content,
			reordered: 0,
			errors: [],
		};
	}
	const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);
	const fixedContent = reorderFunctionDeclarations(sourceFile, analysisResult?.dependencyGraph);
	const hasChanges = defaultPrinter.printFile(sourceFile) !== fixedContent;
	if (hasChanges) {
		return {
			file: filePath,
			fixed: true,
			originalContent: content,
			fixedContent,
			reordered: countFunctionMovements(content, fixedContent),
			errors: [],
		};
	}
	return {
		file: filePath,
		fixed: false,
		originalContent: content,
		fixedContent,
		reordered: 0,
		errors: [],
	};
}

function reorderFunctionDeclarations(
	sourceFile: ts.SourceFile,
	analyzerDependencyGraph?: Map<string, string[]>,
): string {
	const dependencies =
		analyzerDependencyGraph ??
		buildDependencyGraph(categorizeNodes(sourceFile).functions, sourceFile).dependencies;
	let newSourceFile = applyTopLevelReorder(sourceFile, dependencies);
	newSourceFile = transformNestedBlocks(newSourceFile);
	return defaultPrinter.printFile(newSourceFile);
}

/** Thin facade over {@link Pipeline.run} (mode: fix); returns fixResults only. */
export async function fixFiles(params: FixFilesParams): Promise<FixResult[]> {
	const { fixResults } = await runPipeline(params);
	return fixResults;
}

/** Thin facade over {@link Pipeline.run} (mode: fix). */
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

const MOVEMENT_LINE_THRESHOLD = 10;

function countFunctionMovements(original: string, fixed: string): number {
	const originalPositions = buildPositionMap(original);
	const fixedLines = fixed.split("\n");
	const occurrence = new Map<string, number>();
	let reorders = 0;
	for (const [index, line] of fixedLines.entries()) {
		const trimmed = line.trim();
		if (!isFunctionSignature(trimmed)) {
			continue;
		}
		const occ = occurrence.get(trimmed) ?? 0;
		occurrence.set(trimmed, occ + 1);
		const originalPos = originalPositions.get(positionKey(occ, trimmed));
		if (originalPos !== undefined && Math.abs(originalPos - index) > MOVEMENT_LINE_THRESHOLD) {
			reorders++;
		}
	}
	return reorders;
}

function buildPositionMap(content: string): Map<string, number> {
	const positions = new Map<string, number>();
	const occurrence = new Map<string, number>();
	const lines = content.split("\n");
	lines.forEach((line, index) => {
		const trimmed = line.trim();
		if (isFunctionSignature(trimmed)) {
			const occ = occurrence.get(trimmed) ?? 0;
			occurrence.set(trimmed, occ + 1);
			positions.set(positionKey(occ, trimmed), index);
		}
	});
	return positions;
}

function positionKey(occurrence: number, trimmed: string): string {
	return `${occurrence}:${trimmed}`;
}

function isFunctionSignature(trimmed: string): boolean {
	return (
		trimmed.startsWith("function ") || (trimmed.startsWith("const ") && trimmed.includes("=>"))
	);
}

export { reorderTopLevelOnly } from "./stepdown-top-level-reorder";
