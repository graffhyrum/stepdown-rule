import { expect } from "bun:test";
import { randomUUID } from "node:crypto";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { analyzeParsedFile } from "../src/analyzer";
import { FileService } from "../src/services/FileService";
import type { AnalysisResult, Config } from "../src/types";

export const defaultConfig: Config = {
	ignore: [],
	fix: false,
	json: false,
};

export const fixConfig: Config = { ...defaultConfig, fix: true };

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

export function analyzeCode(code: string): AnalysisResult {
	const service = new FileService();
	const parsedFile = service.parseContent(code, "test.ts");
	return analyzeParsedFile(parsedFile);
}

export function totalViolations(result: AnalysisResult | undefined): number {
	return (result?.violations.length ?? 0) + (result?.nestedFunctionViolations.length ?? 0);
}

export async function assertFixReducesViolations(
	code: string,
	config: Config,
	label: string,
): Promise<void> {
	const { analyzeFiles } = await import("../src/analyzer");
	const { fixFiles } = await import("../src/fixer");
	await withTempFile(code, async (file) => {
		const [before] = await analyzeFiles([file], config);
		const violationsBefore = totalViolations(before);
		expect(violationsBefore, `${label} fixture must produce violations`).toBeGreaterThan(0);
		await fixFiles([file], { ...config, fix: true });
		const [after] = await analyzeFiles([file], config);
		expect(totalViolations(after)).toBeLessThan(violationsBefore);
	});
}

export async function copyFixtureToTemp(dirname: string, fixtureName: string): Promise<string> {
	const content = await Bun.file(`fixtures/${fixtureName}`).text();
	const dir = createTempDir(dirname);
	return createTestFile(dir, "test.ts", content);
}
