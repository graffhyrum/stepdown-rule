import { expect } from "bun:test";
import { randomUUID } from "node:crypto";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { analyzeParsedFile } from "../src/analyzer";
import { fixFileWithRules, fixParsedFile } from "../src/fixer";
import { getEnabled } from "../src/registry";
import { InMemoryFileService } from "../src/services/InMemoryFileService";
import type { AnalysisResult, Config, FixResult } from "../src/types";
export const defaultConfig: Config = {
	ignore: [],
	fix: false,
	json: false,
};
export const fixConfig: Config = { ...defaultConfig, fix: true };
export async function copyFixtureToTemp(dirname: string, fixtureName: string): Promise<string> {
	const content = await Bun.file(`fixtures/${fixtureName}`).text();
	const dir = createTempDir(dirname);
	return createTestFile(dir, "test.ts", content);
}
export function assertFixReducesViolations(code: string, config: Config, label: string): void {
	const before = analyzeCode(code);
	const violationsBefore = totalViolations(before);
	expect(violationsBefore, `${label} fixture must produce violations`).toBeGreaterThan(0);
	const { after } = fixCode(code, { ...config, fix: true });
	expect(totalViolations(after)).toBeLessThan(violationsBefore);
}
export async function withTempFile(
	code: string,
	fn: (file: string) => Promise<void>,
	dirname = `temp-${randomUUID().slice(0, 8)}`,
): Promise<void> {
	const dir = createTempDir(dirname);
	try {
		const file = await createTestFile(dir, "test.ts", code);
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
 * In-memory analyze → fix → re-analyze. Prefer over withTempFile for unit tests.
 * Uses rule pipeline when registry has matching rules; else legacy fixParsedFile.
 * Callers that need rules must registerDefaultRules() (e.g. beforeAll) — no side-effect import.
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
	let result: FixResult;
	if (enabledRules.length > 0) {
		result = fixFileWithRules({
			filePath,
			originalContent: code,
			enabledRules,
			service,
		});
	} else {
		const parsedFile = service.parseContent(code, filePath);
		const analysisResult = analyzeParsedFile(parsedFile);
		result = fixParsedFile({
			content: code,
			filePath,
			config,
			analysisResult,
		});
	}
	const after = analyzeParsedFile(service.parseContent(result.fixedContent, filePath));
	return { result, after, fixedContent: result.fixedContent };
}
