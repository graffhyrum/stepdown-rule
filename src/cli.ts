#!/usr/bin/env bun
import "./register-default-rules";
import { Argument, Command, Option } from "commander";
import picocolors from "picocolors";
import { analyzeFiles } from "./analyzer";
import { loadConfig } from "./config/loader";
import { fixFiles } from "./fixer";
import { FileService } from "./services/FileService";
import type { AnalysisResult, Config, FixResult } from "./types";

const ignoreOption = new Option(
	"--ignore <patterns...>",
	"Additional glob patterns to ignore",
).default([]);

const configOption = new Option("--config <file>", "Configuration file path").default(
	".stepdownrc.json",
);

const jsonOption = new Option("--json", "Output results in JSON format").default(false);

const verboseOption = new Option("-v, --verbose", "Show circular dependencies in output").default(
	false,
);

const rulesOption = new Option(
	"--rules <ids>",
	"Comma-separated rule IDs (available: stepdown, nested; default: all)",
);

const patternsArgument = new Argument(
	"[patterns...]",
	'File patterns to analyze (default: "src/**/*.ts")',
).default(["src/**/*.ts"]);

const program = new Command();
program
	.name("stepdown-rule")
	.description("TypeScript AST analyzer that enforces the stepdown rule for function organization")
	.version("0.1.0");

const analyzeCommand = new Command();
analyzeCommand
	.name("analyze")
	.description("Analyze files for stepdown rule violations")
	.addArgument(patternsArgument)
	.addOption(ignoreOption)
	.addOption(configOption)
	.addOption(jsonOption)
	.addOption(verboseOption)
	.addOption(rulesOption)
	.action(async (patterns: string[], options) => {
		const config = await createConfig(options);
		const fileService = new FileService({ ignore: config.ignore });
		if (await hasNoFiles(fileService, patterns)) return;
		const results = await analyzeFiles(patterns, config, fileService);
		outputAnalysisResults(results, config.json, options.verbose);
		const counts = countAnalysisResults(results);
		if (counts.violationCount > 0) {
			process.exitCode = 1;
		}
	});

const fixCommand = new Command();
fixCommand
	.name("fix")
	.description("Automatically fix violations by reordering functions")
	.addArgument(patternsArgument)
	.addOption(ignoreOption)
	.addOption(configOption)
	.addOption(jsonOption)
	.addOption(rulesOption)
	.action(async (patterns: string[], options) => {
		const config = await createFixConfig(options);
		const fileService = new FileService({ ignore: config.ignore });
		if (await hasNoFiles(fileService, patterns)) return;
		const fixResults = await fixFiles(patterns, config, fileService);
		outputFixResults(fixResults, config.json);
	});

program.addCommand(analyzeCommand, { isDefault: true });
program.addCommand(fixCommand);

program.parse();

async function createFixConfig(options: {
	ignore?: string[];
	json?: boolean;
	config?: string;
	rules?: string;
}): Promise<Config> {
	const config = await createConfig(options);
	return { ...config, fix: true };
}

async function createConfig(options: {
	ignore?: string[];
	json?: boolean;
	config?: string;
	rules?: string;
}): Promise<Config> {
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

async function hasNoFiles(fileService: FileService, patterns: string[]): Promise<boolean> {
	const files = await fileService.resolveFiles(patterns);
	if (files.length === 0) {
		console.log(picocolors.yellow(`No files matched: ${patterns.join(", ")}`));
		return true;
	}
	return false;
}

function outputAnalysisResults(results: AnalysisResult[], json: boolean, verbose = false): void {
	if (json) {
		console.log(JSON.stringify(results, null, 2));
		return;
	}
	const counts = countAnalysisResults(results);
	printFormattedResults(results, verbose);
	printAnalysisSummary(counts);
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
				`✓ ${totalFiles} file${totalFiles !== 1 ? "s" : ""} analyzed, no violations`,
			),
		);
		return;
	}
	const parts: string[] = [];
	if (violationCount > 0)
		parts.push(`${violationCount} violation${violationCount !== 1 ? "s" : ""}`);
	if (circularCount > 0)
		parts.push(`${circularCount} circular dependenc${circularCount !== 1 ? "ies" : "y"}`);
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

function outputFixResults(results: FixResult[], json: boolean): void {
	if (json) {
		console.log(JSON.stringify(results, null, 2));
		return;
	}
	const changedFiles = results.filter((result) => result.fixed);
	const failedFiles = results.filter((result) => !result.fixed && result.errors.length > 0);
	for (const result of changedFiles) {
		console.log(formatFixResult(result));
	}
	for (const result of failedFiles) {
		console.log(formatFixResult(result));
	}
	if (changedFiles.length === 0 && failedFiles.length === 0) {
		console.log(picocolors.green("✓ No files needed fixing"));
	}
}

function formatFixResult(result: FixResult): string {
	if (result.fixed) {
		return picocolors.green(`✓ Fixed: ${result.file} (reordered ${result.reordered} functions)`);
	}
	const errors = result.errors.map((error) => picocolors.red(`  ${error}`)).join("\n");
	return picocolors.red(`✗ Failed: ${result.file}`) + (errors ? `\n${errors}` : "");
}
