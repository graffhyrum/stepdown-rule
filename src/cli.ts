#!/usr/bin/env node

import { Command } from "commander";
import picocolors from "picocolors";
import { analyzeFiles } from "./analyzer";
import { fixFiles } from "./fixer";
import type { AnalysisResult, Config, FixResult } from "./types";

function getErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function createConfig(options: {
	ignore?: string[];
	fix?: boolean;
	json?: boolean;
	outputFile?: string;
}): Config {
	return {
		ignore: options.ignore || [],
		analyzeArrowFunctions: true,
		analyzeExportsOnly: false,
		reportCircularDependencies: true,
		fix: options.fix ?? false,
		json: options.json ?? false,
		outputFile: options.outputFile,
	};
}

function getPatterns(patterns: string[]): string[] {
	return patterns.length > 0 ? patterns : ["src/**/*.ts"];
}

function formatFixResult(result: FixResult): string {
	if (result.fixed) {
		return picocolors.green(`✓ Fixed: ${result.file} (reordered ${result.reordered} functions)`);
	}
	const errors = result.errors.map((error) => picocolors.red(`  ${error}`)).join("\n");
	return picocolors.red(`✗ No changes: ${result.file}`) + (errors ? `\n${errors}` : "");
}

function outputFixResults(results: FixResult[], json: boolean): void {
	if (json) {
		console.log(JSON.stringify(results, null, 2));
		return;
	}
	for (const result of results) {
		console.log(formatFixResult(result));
	}
}

function formatViolation(violation: AnalysisResult["violations"][number]): string {
	const header = picocolors.red(
		`  ${violation.function.position.line}:${violation.function.position.column} - ${violation.message}`,
	);
	const detail = picocolors.gray(
		`    ${violation.function.name} calls ${violation.dependency.name} which appears later`,
	);
	return `${header}\n${detail}`;
}

function formatCircularDependency(cycle: string[]): string {
	return picocolors.red(`  Circular dependency: ${cycle.join(" → ")} → ${cycle[0]}`);
}

function formatAnalysisResult(result: AnalysisResult): string | null {
	if (result.violations.length === 0 && result.circularDependencies.length === 0) {
		return null;
	}

	const lines: string[] = [picocolors.yellow(`\n${result.file}:`)];

	for (const violation of result.violations) {
		lines.push(formatViolation(violation));
	}

	for (const cycle of result.circularDependencies) {
		lines.push(formatCircularDependency(cycle));
	}

	return lines.join("\n");
}

function outputAnalysisResults(results: AnalysisResult[], json: boolean): void {
	if (json) {
		console.log(JSON.stringify(results, null, 2));
		return;
	}

	let totalViolations = 0;
	let totalFiles = 0;

	for (const result of results) {
		totalFiles += 1;
		totalViolations += result.violations.length;

		const formatted = formatAnalysisResult(result);
		if (formatted) {
			console.log(formatted);
		}
	}

	if (totalViolations === 0 && results.every((r) => r.circularDependencies.length === 0)) {
		console.log(picocolors.green("✓ No stepdown violations found"));
	} else {
		console.log(picocolors.yellow(`\nFound ${totalViolations} violations in ${totalFiles} files`));
	}
}

async function handleFix(patterns: string[], config: Config): Promise<void> {
	const fixResults = await fixFiles(getPatterns(patterns), config);
	outputFixResults(fixResults, config.json);
}

async function handleAnalyze(patterns: string[], config: Config): Promise<void> {
	const results = await analyzeFiles(getPatterns(patterns), config);
	outputAnalysisResults(results, config.json);
}

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
	.action(async (patterns: string[], options) => {
		const config = createConfig(options);

		try {
			if (config.fix) {
				await handleFix(patterns, config);
			} else {
				await handleAnalyze(patterns, config);
			}
		} catch (error) {
			console.error(picocolors.red("Error:"), getErrorMessage(error));
			process.exit(1);
		}
	});

program.parse();
