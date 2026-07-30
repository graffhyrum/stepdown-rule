import ts from "typescript";
import { buildRuleContext } from "./analyzer";
import { buildDependencyGraph } from "./ast-graph-builder";
import { categorizeNodes } from "./ast-node-visitors";
import { transformNestedBlocks } from "./nested-block-transform";
import { Pipeline, type PipelineResult } from "./pipeline";
import type { RuleRegistry } from "./registry";
import type { ViolationRule } from "./rule-context";
import { FileService } from "./services/FileService";
import type { IFileService } from "./services/types";
import { applyTopLevelReorder } from "./stepdown-top-level-reorder";
import type { AnalysisResult, Config, FixResult } from "./types";

export type { PipelineResult };

export interface FixFilesOptions {
	dryRun?: boolean;
	resolvedFiles?: string[];
}
const defaultPrinter = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
export async function fixFile(params: {
	filePath: string;
	config: Config;
	service: IFileService;
	analysisResult: AnalysisResult;
	dryRun: boolean;
}): Promise<FixResult> {
	const { filePath, config, service, analysisResult, dryRun } = params;
	const originalContent = await service.readFile(filePath);
	const fixResult = fixParsedFile({ content: originalContent, filePath, config, analysisResult });
	if (fixResult.fixed && !dryRun) {
		await service.writeFile(filePath, fixResult.fixedContent);
	}
	return fixResult;
}
export function fixParsedFile(params: {
	content: string;
	filePath: string;
	config?: Config;
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
export async function fixFiles(
	patterns: string[],
	config: Config,
	fileService?: IFileService,
	options: FixFilesOptions = {},
	registry?: RuleRegistry,
): Promise<FixResult[]> {
	const { fixResults } = await runPipeline(
		patterns,
		{ ...config, fix: true },
		fileService,
		options,
		registry,
	);
	return fixResults;
}
/** Thin facade over {@link Pipeline.run} (mode: fix). */
export async function runPipeline(
	patterns: string[],
	config: Config,
	fileService?: IFileService,
	pipelineOptions: FixFilesOptions = {},
	registry?: RuleRegistry,
): Promise<PipelineResult> {
	const service = fileService ?? new FileService({ ignore: config.ignore });
	return Pipeline.run({
		patterns,
		config: { ...config, fix: true },
		fileService: service,
		registry,
		mode: "fix",
		resolvedFiles: pipelineOptions.resolvedFiles,
		dryRun: pipelineOptions.dryRun,
	});
}
export function fixFileWithRules(params: {
	filePath: string;
	originalContent: string;
	enabledRules: ViolationRule[];
	service: IFileService;
}): FixResult {
	const { filePath, originalContent, enabledRules, service } = params;
	let content = originalContent;
	for (const rule of enabledRules) {
		const parsedFile = service.parseContent(content, filePath);
		const ctx = buildRuleContext(parsedFile);
		const violations = rule.analyze(ctx);
		if (violations.length > 0) {
			content = rule.fix(ctx, violations);
		}
	}
	const fixed = hasPrintToPrintChange(originalContent, content, filePath);
	return {
		file: filePath,
		fixed,
		originalContent,
		fixedContent: content,
		reordered: fixed ? countFunctionMovements(originalContent, content) : 0,
		errors: [],
	};
}
/** True when printing both sides yields different text (never raw !== printed). */
function hasPrintToPrintChange(
	originalContent: string,
	candidateContent: string,
	filePath: string,
): boolean {
	return printSource(originalContent, filePath) !== printSource(candidateContent, filePath);
}
function printSource(content: string, filePath: string): string {
	return defaultPrinter.printFile(
		ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true),
	);
}
// Leaf finding and topological sort now use graph-algorithms module
// MOVEMENT COUNTING: quantify function relocations
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
		if (originalPos !== undefined && Math.abs(originalPos - index) > 10) {
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
