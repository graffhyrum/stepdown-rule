import type { CliErrorPayload } from "./cli-errors";
import { sanitizeForJson, type JsonAnalysisResult } from "./cli-json";
import {
	ExitConfig,
	ExitInternal,
	ExitNoFiles,
	ExitSuccess,
	ExitUsage,
	ExitViolationsOrFixErrors,
} from "./exit-codes";
import type { AnalysisResult, FixResult } from "./types";
export const AGENTS_SCHEMA_VERSION = 1;
const RULE_DESCRIPTIONS: Record<string, string> = {
	stepdown: "Caller-before-callee at module scope",
	nested: "Logic-before-nested-functions inside a body",
};
export interface AgentsEnvelope<T> {
	schemaVersion: number;
	command: string;
	ok: boolean;
	exitCode: number;
	summary: AgentsAnalyzeSummary | AgentsFixSummary;
	results: T[];
	errors: CliErrorPayload[];
}
export interface AgentsAnalyzeSummary {
	files: number;
	violations: number;
	circularDependencies: number;
}
export interface AgentsFixSummary {
	files: number;
	fixed: number;
	failed: number;
}
export interface AgentsFixResult {
	file: string;
	fixed: boolean;
	reordered: number;
	errors: string[];
	preview?: string;
	originalContent?: string;
	fixedContent?: string;
}
export function toAgentsFixResults(
	results: FixResult[],
	options: {
		dryRun: boolean;
		includeContent: boolean;
	},
): AgentsFixResult[] {
	return results.map((r) => {
		const base: AgentsFixResult = {
			file: r.file,
			fixed: r.fixed,
			reordered: r.reordered,
			errors: r.errors,
		};
		if (options.dryRun && r.fixed && r.originalContent !== r.fixedContent) {
			base.preview = boundedPreview(r.originalContent, r.fixedContent);
		}
		if (options.includeContent) {
			base.originalContent = r.originalContent;
			base.fixedContent = r.fixedContent;
		}
		return base;
	});
}
export function buildFixEnvelope(
	command: string,
	results: AgentsFixResult[],
	errors: CliErrorPayload[],
	fixFailed: boolean,
): AgentsEnvelope<AgentsFixResult> {
	const summary = countFixSummary(results);
	const exitCode = resolveEnvelopeExitCode(errors, fixFailed);
	return {
		schemaVersion: AGENTS_SCHEMA_VERSION,
		command,
		ok: exitCode === ExitSuccess,
		exitCode,
		summary,
		results,
		errors,
	};
}
export function buildAnalyzeEnvelope(
	command: string,
	results: AnalysisResult[],
	errors: CliErrorPayload[],
	includeGraph: boolean,
): AgentsEnvelope<JsonAnalysisResult> {
	const summary = countAnalysisSummary(results);
	const exitCode = resolveEnvelopeExitCode(errors, summary.violations > 0);
	return {
		schemaVersion: AGENTS_SCHEMA_VERSION,
		command,
		ok: exitCode === ExitSuccess,
		exitCode,
		summary,
		results: sanitizeForJson(results, includeGraph),
		errors,
	};
}
function resolveEnvelopeExitCode(errors: CliErrorPayload[], failed: boolean): number {
	if (errors.length > 0) return exitCodeFromErrors(errors);
	if (failed) return ExitViolationsOrFixErrors;
	return ExitSuccess;
}
export function ruleDescription(id: string): string {
	return RULE_DESCRIPTIONS[id] ?? id;
}
export function exitCodeFromErrors(errors: CliErrorPayload[]): number {
	if (errors.some((e) => e.code === "CONFIG_ERROR")) return ExitConfig;
	if (errors.some((e) => e.code === "NO_FILES")) return ExitNoFiles;
	if (errors.some((e) => e.code === "USAGE")) return ExitUsage;
	return ExitInternal;
}
export function emitAgentsJson<T>(envelope: AgentsEnvelope<T>): void {
	process.stdout.write(`${JSON.stringify(envelope)}\n`);
}
export function countAnalysisSummary(results: AnalysisResult[]): AgentsAnalyzeSummary {
	let violations = 0;
	let circularDependencies = 0;
	for (const result of results) {
		violations += result.violations.length + result.nestedFunctionViolations.length;
		circularDependencies += result.circularDependencies.length;
	}
	return { files: results.length, violations, circularDependencies };
}
export function countFixSummary(results: AgentsFixResult[]): AgentsFixSummary {
	let fixed = 0;
	let failed = 0;
	for (const r of results) {
		if (r.errors.length > 0) failed += 1;
		else if (r.fixed) fixed += 1;
	}
	return { files: results.length, fixed, failed };
}
export function boundedPreview(original: string, fixed: string, maxLines = 40): string {
	if (original === fixed) return "";
	const origLines = original.split("\n");
	const fixedLines = fixed.split("\n");
	const out: string[] = [];
	const maxLen = Math.max(origLines.length, fixedLines.length);
	for (let i = 0; i < maxLen && out.length < maxLines; i++) {
		const o = origLines[i];
		const f = fixedLines[i];
		if (o === f) continue;
		if (o !== undefined) out.push(`- ${o}`);
		if (f !== undefined) out.push(`+ ${f}`);
	}
	return out.join("\n");
}
export function fixResultsIndicateFailure(results: FixResult[]): boolean {
	return results.some((r) => {
		if (r.errors.length > 0) return true;
		if (r.fixed) return false;
		if (r.originalContent.length === 0) return false;
		return r.originalContent === r.fixedContent;
	});
}
