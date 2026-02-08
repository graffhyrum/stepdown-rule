// Rule Compliance Validator
// Scans code for violations of AGENTS.md rules

import { promises } from "node:fs";
import path from "node:path";

interface Rule {
	name: string;
	pattern: RegExp;
	message: string;
	severity: "error" | "warning";
}

interface Violation {
	file: string;
	line: number;
	column: number;
	rule: Rule;
	match: string;
}

const RULES: Rule[] = [
	{
		name: "no-waitForTimeout",
		pattern: /\bwaitForTimeout\s*\(/g,
		message:
			"AVOID STATIC TIMEOUTS: Use Playwright's auto-waiting and web-first assertions instead of waitForTimeout(). See https://playwright.dev/docs/actionability and https://playwright.dev/docs/best-practices#use-web-first-assertions",
		severity: "error",
	},
	{
		name: "no-any-types",
		pattern: /:\s*any\b/g,
		message: "STRICT MODE: No any types, use ArkType and validator functions.",
		severity: "error",
	},
	{
		name: "template-literals-only",
		pattern: /"\s*\+\s*[^"]|\+\s*"[^"]*"/g,
		message: "TEMPLATE LITERALS ONLY: Use template literal syntax not string concatenation",
		severity: "error",
	},
	{
		name: "no-static-classes",
		pattern: /export\s+class\s+\w+Impl/g,
		message: "AVOID STATIC-ONLY CLASSES: Convert to module functions",
		severity: "error",
	},
];

interface CheckLineParams {
	line: string;
	lineIndex: number;
	filePath: string;
	violations: Violation[];
}

function checkLineForViolations(params: CheckLineParams): void {
	const { line, lineIndex, filePath, violations } = params;
	for (const rule of RULES) {
		const matches = [...line.matchAll(rule.pattern)];
		for (const match of matches) {
			violations.push({
				file: filePath,
				line: lineIndex + 1,
				column: match.index || 0,
				rule,
				match: match[0],
			});
		}
	}
}

async function scanFile(filePath: string): Promise<Violation[]> {
	const violations: Violation[] = [];
	const content = await Bun.file(filePath).text();
	const lines = content.split("\n");

	for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
		const thisLine = lines[lineIndex];
		if (thisLine === undefined) {
			continue;
		}
		checkLineForViolations({
			line: thisLine,
			lineIndex,
			filePath,
			violations,
		});
	}

	return violations;
}

function shouldProcessFile(file: string): boolean {
	const isValidExtension =
		file.endsWith(".ts") || file.endsWith(".tsx") || file.endsWith(".js") || file.endsWith(".jsx");
	const isNotSelf = !file.includes("rule-validator");
	return isValidExtension && isNotSelf;
}

function countBySeverity(violations: Violation[], severity: "error" | "warning"): number {
	return violations.filter((v) => v.rule.severity === severity).length;
}

function printViolations(file: string, violations: Violation[]): void {
	const relativePath = path.relative(process.cwd(), file);
	console.log(`📁 ${relativePath}:`);
	for (const v of violations) {
		const icon = v.rule.severity === "error" ? "❌" : "⚠️";
		console.log(`  ${icon} Line ${v.line}:${v.column} - ${v.rule.message}`);
		console.log(`    Found: ${v.match.trim()}`);
	}
	console.log("");
}

function printSummaryReport(
	totalViolations: number,
	errorCount: number,
	warningCount: number,
): void {
	console.log(
		`📊 Summary: ${totalViolations} violations (${errorCount} errors, ${warningCount} warnings)`,
	);
}

function exitWithResult(errorCount: number, warningCount: number): never {
	if (errorCount > 0) {
		console.log("\n🚫 Errors found! Fix before proceeding.");
		process.exit(1);
	} else if (warningCount > 0) {
		console.log("\n⚠️ Warnings found. Consider fixing for better compliance.");
		process.exit(0);
	} else {
		process.exit(0);
	}
}

async function scanFiles(
	pattern: string,
): Promise<{ totalViolations: number; errorCount: number; warningCount: number }> {
	const files = promises.glob(pattern, {
		exclude: [
			"node_modules/**",
			"**/node_modules/**",
			"dist/**",
			"build/**",
			".git/**",
			"playwright-report/**",
		],
	});

	let totalViolations = 0;
	let errorCount = 0;
	let warningCount = 0;

	for await (const file of files) {
		if (!shouldProcessFile(file)) {
			continue;
		}

		const violations = await scanFile(file);
		if (violations.length > 0) {
			printViolations(file, violations);
			totalViolations += violations.length;
			errorCount += countBySeverity(violations, "error");
			warningCount += countBySeverity(violations, "warning");
		}
	}

	return { totalViolations, errorCount, warningCount };
}

const args = process.argv.slice(2);
const pattern = args[0] || "**/*.{ts,tsx,js,jsx}";

console.log("🔍 Scanning for rule violations...\n");

try {
	const { totalViolations, errorCount, warningCount } = await scanFiles(pattern);
	printSummaryReport(totalViolations, errorCount, warningCount);
	exitWithResult(errorCount, warningCount);
} catch (error) {
	console.error("❌ Error scanning files:", error);
	process.exit(1);
}
