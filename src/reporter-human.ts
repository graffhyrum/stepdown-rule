import picocolors from "picocolors";
import type { CliErrorPayload } from "./cli-errors";
import { boundedPreview, exitCodeFromErrors, fixResultsIndicateFailure } from "./cli-output";
import { ExitSuccess, ExitViolationsOrFixErrors } from "./exit-codes";
import type { Reporter } from "./reporter";
import type { AnalysisResult, FixResult } from "./types";

export function createHumanReporter(): Reporter {
	return {
		format: "human",
		reportAnalyze(results, options = {}) {
			const verbose = options.verbose ?? false;
			const counts = countAnalysisResults(results);
			printFormattedResults(results, verbose);
			printAnalysisSummary(counts);
			return counts.violationCount > 0 ? ExitViolationsOrFixErrors : ExitSuccess;
		},
		reportFix(results, options = {}) {
			outputFixResults(results, options.dryRun ?? false);
			return fixResultsIndicateFailure(results) ? ExitViolationsOrFixErrors : ExitSuccess;
		},
		reportEarlyFailure(_kind: "analyze" | "fix", errors: CliErrorPayload[]) {
			return exitCodeFromErrors(errors);
		},
	};
}

function outputFixResults(results: FixResult[], dryRun: boolean): void {
	const changedFiles = results.filter((result) => result.fixed);
	const failedFiles = results.filter((result) => !result.fixed && result.errors.length > 0);
	for (const result of changedFiles) {
		console.log(formatFixResult(result, dryRun));
		if (dryRun) {
			const preview = boundedPreview(result.originalContent, result.fixedContent);
			if (preview) {
				console.log(preview);
			}
		}
	}
	for (const result of failedFiles) {
		console.log(formatFixResult(result, dryRun));
	}
	if (changedFiles.length === 0 && failedFiles.length === 0) {
		console.log(picocolors.green("✓ No files needed fixing"));
	}
}

function formatFixResult(result: FixResult, dryRun: boolean): string {
	if (result.fixed) {
		const verb = dryRun ? "Would fix" : "Fixed";
		return picocolors.green(`✓ ${verb}: ${result.file} (reordered ${result.reordered} functions)`);
	}
	const errors = result.errors.map((error) => picocolors.red(`  ${error}`)).join("\n");
	return picocolors.red(`✗ Failed: ${result.file}`) + (errors ? `\n${errors}` : "");
}

function countAnalysisResults(results: AnalysisResult[]): {
	violationCount: number;
	totalFiles: number;
	circularCount: number;
} {
	let violationCount = 0;
	let circularCount = 0;
	for (const result of results) {
		violationCount += result.violations.length + result.nestedFunctionViolations.length;
		circularCount += result.circularDependencies.length;
	}
	return { violationCount, totalFiles: results.length, circularCount };
}

function printFormattedResults(results: AnalysisResult[], verbose: boolean): void {
	for (const result of results) {
		const formatted = formatAnalysisResult(result, verbose);
		if (formatted) {
			console.log(formatted);
		}
	}
}

function printAnalysisSummary(counts: ReturnType<typeof countAnalysisResults>): void {
	const { violationCount, totalFiles, circularCount } = counts;
	if (violationCount === 0 && circularCount === 0) {
		console.log(
			picocolors.green(
				`✓ ${totalFiles} file${totalFiles === 1 ? "" : "s"} analyzed, no violations`,
			),
		);
		return;
	}
	const parts: string[] = [];
	if (violationCount > 0)
		parts.push(`${violationCount} violation${violationCount === 1 ? "" : "s"}`);
	if (circularCount > 0)
		parts.push(`${circularCount} circular dependenc${circularCount === 1 ? "y" : "ies"}`);
	console.log(picocolors.yellow(`\nFound ${parts.join(" and ")} in ${totalFiles} files`));
}

function formatAnalysisResult(result: AnalysisResult, verbose = false): string | null {
	if (
		result.violations.length === 0 &&
		result.nestedFunctionViolations.length === 0 &&
		!verbose &&
		result.circularDependencies.length === 0
	) {
		return null;
	}
	const lines: string[] = [];
	for (const violation of result.violations) {
		lines.push(formatViolation(result.file, violation));
	}
	for (const violation of result.nestedFunctionViolations) {
		lines.push(formatNestedFunctionViolation(result.file, violation));
	}
	if (verbose) {
		for (const cycle of result.circularDependencies) {
			lines.push(formatCircularDependency(result.file, cycle));
		}
	}
	return lines.length > 0 ? lines.join("\n") : null;
}

function formatNestedFunctionViolation(
	file: string,
	violation: AnalysisResult["nestedFunctionViolations"][number],
): string {
	const nestedLine = violation.nested.position.line;
	const nestedCol = violation.nested.position.column;
	const parentLine = violation.parent.position.line;
	const parentCol = violation.parent.position.column;
	const header = picocolors.red(`${file}:${nestedLine}:${nestedCol} - ${violation.message}`);
	const detail = picocolors.gray(`  parent function: ${file}:${parentLine}:${parentCol}`);
	return `${header}\n${detail}`;
}

function formatCircularDependency(file: string, cycle: string[]): string {
	return picocolors.red(`${file} - Circular dependency: ${cycle.join(" → ")}`);
}

function formatViolation(file: string, violation: AnalysisResult["violations"][number]): string {
	const funcLine = violation.function.position.line;
	const funcCol = violation.function.position.column;
	const callLine = violation.callSite.line;
	const callCol = violation.callSite.column;
	const depLine = violation.dependency.position.line;
	const depCol = violation.dependency.position.column;
	const header = picocolors.red(`${file}:${funcLine}:${funcCol} - ${violation.message}`);
	const callSiteLink = picocolors.gray(`  call site: ${file}:${callLine}:${callCol}`);
	const depLink = picocolors.gray(`  dependency declared at: ${file}:${depLine}:${depCol}`);
	return `${header}\n${callSiteLink}\n${depLink}`;
}
