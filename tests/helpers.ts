import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { Config } from "../src/types";

export const defaultConfig: Config = {
	ignore: [],
	analyzeArrowFunctions: true,
	analyzeExportsOnly: false,
	reportCircularDependencies: true,
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
