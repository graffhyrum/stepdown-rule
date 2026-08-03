import { expect } from "bun:test";
import { randomUUID } from "node:crypto";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { analyzeParsedFile, buildRuleContext } from "../src/analyzer";
import { fixFileWithRules } from "../src/fixer";
import { registerDefaultRules } from "../src/register-default-rules";
import { createRegistry, getEnabled } from "../src/registry";
import type { RuleContext } from "../src/rule-context";
import { InMemoryFileService } from "../src/services/InMemoryFileService";
import type { AnalysisResult, Config, FixResult } from "../src/types";

export const defaultConfig: Config = {
	ignore: [],
	json: false,
};

/** Same as defaultConfig — fix is mode on Pipeline, not a Config flag. */
export const fixConfig: Config = defaultConfig;

/** Minimal stepdown violation for in-memory pipeline tests. */
export const MEM_STEPDOWN = `function low() { return 1; }\nfunction high() { return low(); }\n`;
export const MEM_PATH = "mem/sample.ts";

export function defaultRulesRegistry() {
	const registry = createRegistry();
	registerDefaultRules(registry);
	return registry;
}

export function parseRuleContext(
	code: string,
	filePath = "test.ts",
): {
	service: InMemoryFileService;
	ctx: RuleContext;
} {
	const service = new InMemoryFileService();
	const parsedFile = service.parseContent(code, filePath);
	return { service, ctx: buildRuleContext(parsedFile) };
}

export function assertFixReducesViolations(code: string, config: Config, label: string): void {
	const before = analyzeCode(code);
	const violationsBefore = totalViolations(before);
	expect(violationsBefore, `${label} fixture must produce violations`).toBeGreaterThan(0);
	const { after } = fixCode(code, config);
	expect(totalViolations(after)).toBeLessThan(violationsBefore);
}

export async function withTempFile(
	code: string,
	fn: (file: string) => Promise<void>,
	dirname = `temp-${randomUUID().slice(0, 8)}`,
	filename = "test.ts",
): Promise<void> {
	const dir = createTempDir(dirname);
	try {
		const file = await createTestFile(dir, filename, code);
		await fn(file);
	} finally {
		cleanupTempDir(dir);
	}
}

export function createTempDir(name: string): string {
	const dir = join(process.cwd(), "tests", name);
	rmSync(dir, { recursive: true, force: true });
	mkdirSync(dir, { recursive: true });
	return dir;
}

export function cleanupTempDir(dir: string): void {
	try {
		rmSync(dir, { recursive: true, force: true });
	} catch {
		// Ignore
	}
}

export async function createTestFile(
	dir: string,
	filename: string,
	content: string,
): Promise<string> {
	const filePath = join(dir, filename);
	await Bun.write(filePath, content);
	return filePath;
}

export function analyzeCode(code: string): AnalysisResult {
	const service = new InMemoryFileService();
	const parsedFile = service.parseContent(code, "test.ts");
	return analyzeParsedFile(parsedFile);
}

export function totalViolations(result: AnalysisResult | undefined): number {
	return (result?.violations.length ?? 0) + (result?.nestedFunctionViolations.length ?? 0);
}

/**
 * In-memory analyze → fix → re-analyze via rule-based fixFileWithRules.
 * Callers must registerDefaultRules() (e.g. beforeAll) — no side-effect import.
 */
export function fixCode(
	code: string,
	config: Config = fixConfig,
): {
	result: FixResult;
	after: AnalysisResult;
	fixedContent: string;
} {
	const service = new InMemoryFileService();
	const filePath = "test.ts";
	const enabledRules = getEnabled(config.enabledRuleIds);
	const result = fixFileWithRules({
		filePath,
		originalContent: code,
		enabledRules,
		service,
	});
	const after = analyzeParsedFile(service.parseContent(result.fixedContent, filePath));
	return { result, after, fixedContent: result.fixedContent };
}
