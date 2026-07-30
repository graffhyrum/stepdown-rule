import type { CliErrorPayload } from "./cli-errors";
import { sanitizeForJson } from "./cli-json";
import {
	buildAnalyzeEnvelope,
	buildFixEnvelope,
	emitAgentsJson,
	exitCodeFromErrors,
	fixResultsIndicateFailure,
	toAgentsFixResults,
} from "./cli-output";
import { ExitSuccess, ExitViolationsOrFixErrors } from "./exit-codes";
import { createHumanReporter } from "./reporter-human";
import type { AnalysisResult, FixResult } from "./types";
export type CliFormat = "human" | "json" | "agents";
export interface AnalyzeReportOptions {
	verbose?: boolean;
	includeGraph?: boolean;
	command?: string;
	errors?: CliErrorPayload[];
}
export interface FixReportOptions {
	dryRun?: boolean;
	includeContent?: boolean;
	command?: string;
	errors?: CliErrorPayload[];
}
/** Presentation port: stdout adapters for human | json | agents. Returns suggested exit code. */
export interface Reporter {
	readonly format: CliFormat;
	reportAnalyze(results: AnalysisResult[], options?: AnalyzeReportOptions): number;
	reportFix(results: FixResult[], options?: FixReportOptions): number;
	/** Machine formats emit stdout on early failure; human no-ops (errors already on stderr). */
	reportEarlyFailure(
		kind: "analyze" | "fix",
		errors: CliErrorPayload[],
		options?: AnalyzeReportOptions & FixReportOptions,
	): number;
}
export function createReporter(format: CliFormat): Reporter {
	switch (format) {
		case "human":
			return createHumanReporter();
		case "json":
			return createJsonReporter();
		case "agents":
			return createAgentsReporter();
		default: {
			const _exhaustive: never = format;
			throw new Error(`Unknown report format: ${String(_exhaustive)}`);
		}
	}
}
function createJsonReporter(): Reporter {
	return {
		format: "json",
		reportAnalyze(results, options = {}) {
			console.log(JSON.stringify(sanitizeForJson(results, options.includeGraph ?? true), null, 2));
			return analysisExitCode(results);
		},
		reportFix(results) {
			console.log(JSON.stringify(results, null, 2));
			return fixResultsIndicateFailure(results) ? ExitViolationsOrFixErrors : ExitSuccess;
		},
		reportEarlyFailure(_kind, errors) {
			console.log(JSON.stringify([]));
			return exitCodeFromErrors(errors);
		},
	};
}
export function resolveFormat(options: { json?: boolean; format?: string }): CliFormat {
	if (options.format === "human" || options.format === "json" || options.format === "agents") {
		return options.format;
	}
	if (options.json) return "json";
	return "human";
}
function analysisExitCode(results: AnalysisResult[]): number {
	for (const result of results) {
		if (result.violations.length > 0 || result.nestedFunctionViolations.length > 0) {
			return ExitViolationsOrFixErrors;
		}
	}
	return ExitSuccess;
}
function createAgentsReporter(): Reporter {
	return {
		format: "agents",
		reportAnalyze(results, options = {}) {
			const envelope = buildAnalyzeEnvelope(
				options.command ?? "agents/analyze",
				results,
				options.errors ?? [],
				options.includeGraph ?? false,
			);
			emitAgentsJson(envelope);
			return envelope.exitCode;
		},
		reportFix(results, options = {}) {
			const agentsResults = toAgentsFixResults(results, {
				dryRun: options.dryRun ?? false,
				includeContent: options.includeContent ?? false,
			});
			const envelope = buildFixEnvelope(
				options.command ?? "agents/fix",
				agentsResults,
				options.errors ?? [],
				fixResultsIndicateFailure(results),
			);
			emitAgentsJson(envelope);
			return envelope.exitCode;
		},
		reportEarlyFailure(kind, errors, options = {}) {
			if (kind === "analyze") {
				const envelope = buildAnalyzeEnvelope(
					options.command ?? "agents/analyze",
					[],
					errors,
					false,
				);
				emitAgentsJson(envelope);
				return envelope.exitCode;
			}
			const envelope = buildFixEnvelope(options.command ?? "agents/fix", [], errors, true);
			emitAgentsJson(envelope);
			return envelope.exitCode;
		},
	};
}
