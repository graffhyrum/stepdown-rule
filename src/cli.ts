#!/usr/bin/env bun
import { Command } from "commander";
import picocolors from "picocolors";
import { analyzeFiles } from "./analyzer";
import { loadConfig } from "./config/loader";
import { fixFiles } from "./fixer";
import { FileService } from "./services/FileService";
import type { AnalysisResult, Config, FixResult } from "./types";

const program = new Command();
program
	.name("stepdown-rule")
	.description("TypeScript AST analyzer that enforces the stepdown rule for function organization")
	.version("0.1.0")
	.argument("[patterns...]", 'File patterns to analyze (default: "src/**/*.ts")')
	.option("--fix", "Automatically fix violations by reordering functions", false)
	.option("--json", "Output results in JSON format", false)
	.option("--output-file <file>", "Write JSON output to file")
	.option("--ignore <patterns...>", "Additional ignore patterns")
	.option("--config <file>", "Configuration file path", ".stepdownrc.json")
	.option("--verbose", "Show circular dependencies in output", false)
	.action(async (patterns: string[], options) => {
		const config = await createConfig(options);
		try {
			if (config.fix) {
				await handleFix(patterns, config);
			} else {
				await handleAnalyze(patterns, config, options.verbose);
			}
		} catch (error) {
			console.error(picocolors.red("Error:"), getErrorMessage(error));
			process.exit(1);
		}
	});
program.parse();

async function createConfig(options: {
	ignore?: string[];
	fix?: boolean;
	json?: boolean;
	outputFile?: string;
	config?: string;
}): Promise<Config> {
	const fileConfig = await loadConfig(options.config);
	return {
		ignore: options.ignore ?? fileConfig.ignore,
		analyzeArrowFunctions: fileConfig.analyzeArrowFunctions,
		analyzeExportsOnly: fileConfig.analyzeExportsOnly,
		reportCircularDependencies: fileConfig.reportCircularDependencies,
		fix: options.fix ?? false,
		json: options.json ?? false,
		outputFile: options.outputFile,
	};
}

function getErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

async function handleAnalyze(patterns: string[], config: Config, verbose: boolean): Promise<void> {
	const fileService = new FileService({ ignore: config.ignore });
	const results = await analyzeFiles(getPatterns(patterns), config, fileService);
	outputAnalysisResults(results, config.json, verbose);
}

function outputAnalysisResults(
	results: AnalysisResult[],
	json: boolean,
	verbose: boolean = false,
): void {
	if (json) {
		console.log(JSON.stringify(results, null, 2));
		return;
	}
	let totalViolations = 0;
	let totalNestedViolations = 0;
	let totalFiles = 0;
	for (const result of results) {
		totalFiles += 1;
		totalViolations += result.violations.length;
		totalNestedViolations += result.nestedFunctionViolations.length;
		const formatted = formatAnalysisResult(result, verbose);
		if (formatted) {
			console.log(formatted);
		}
	}
	const allClean =
		totalViolations === 0 &&
		totalNestedViolations === 0 &&
		results.every((r) => r.circularDependencies.length === 0);
	if (allClean) {
		console.log(picocolors.green("✓ No stepdown violations found"));
	} else {
		const violationCount = totalViolations + totalNestedViolations;
		console.log(picocolors.yellow(`\nFound ${violationCount} violations in ${totalFiles} files`));
	}
}

function formatAnalysisResult(result: AnalysisResult, verbose: boolean = false): string | null {
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

async function handleFix(patterns: string[], config: Config): Promise<void> {
	const fileService = new FileService({ ignore: config.ignore });
	const fixResults = await fixFiles(getPatterns(patterns), config, fileService);
	outputFixResults(fixResults, config.json);
}

function getPatterns(patterns: string[]): string[] {
	return patterns.length > 0 ? patterns : ["src/**/*.ts"];
}

function outputFixResults(results: FixResult[], json: boolean): void {
	if (json) {
		console.log(JSON.stringify(results, null, 2));
		return;
	}
	const changedFiles = results.filter((result) => result.fixed);
	for (const result of changedFiles) {
		console.log(formatFixResult(result));
	}
	if (changedFiles.length === 0) {
		console.log(picocolors.green("✓ No files needed fixing"));
	}
}

function formatFixResult(result: FixResult): string {
	if (result.fixed) {
		return picocolors.green(`✓ Fixed: ${result.file} (reordered ${result.reordered} functions)`);
	}
	const errors = result.errors.map((error) => picocolors.red(`  ${error}`)).join("\n");
	return picocolors.red(`✗ No changes: ${result.file}`) + (errors ? `\n${errors}` : "");
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
	return picocolors.red(`${file} - Circular dependency: ${cycle.join(" → ")} → ${cycle[0]}`);
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
