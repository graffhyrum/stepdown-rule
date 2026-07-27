import { lstat } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { glob } from "glob";
import { minimatch } from "minimatch";
import ts from "typescript";
import type { FileServiceOptions, IFileService, ParsedFile } from "./types";

const IGNORED_DIRS = ["node_modules", "dist", "coverage"];

export class FileService implements IFileService {
	private ignore: string[];

	constructor(options: FileServiceOptions = {}) {
		this.ignore = options.ignore ?? [];
	}

	async resolveFiles(patterns: string[]): Promise<string[]> {
		const expanded = await Promise.all(patterns.map(normalizePattern));
		const builtInIgnore = buildIgnore();
		// glob ignore skips trees when patterns are relative; post-filter covers absolute Windows paths.
		const results = await Promise.all(
			expanded.map((p) => glob(p, { ignore: builtInIgnore, windowsPathsNoEscape: true })),
		);
		const unique = [...new Set(results.flat().map(toPosixPath))].sort((a, b) => a.localeCompare(b));
		return applyIgnore(unique, [...builtInIgnore, ...this.ignore]);
	}

	async parseFile(filePath: string): Promise<ParsedFile> {
		const content = await this.readFile(filePath);
		return this.parseContent(content, filePath);
	}

	parseContent(content: string, filePath: string): ParsedFile {
		const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);
		return { sourceFile, filePath, content };
	}

	async readFile(filePath: string): Promise<string> {
		return await Bun.file(filePath).text();
	}

	async writeFile(filePath: string, content: string): Promise<void> {
		assertWriteSafe(filePath);
		await Bun.write(filePath, content);
	}
}

function applyIgnore(paths: string[], patterns: string[]): string[] {
	if (patterns.length === 0) return paths;
	const normalized = patterns.map(toPosixPath);
	return paths.filter((p) => !normalized.some((pat) => minimatch(p, pat)));
}

async function normalizePattern(pattern: string): Promise<string> {
	try {
		const stat = await lstat(pattern);
		if (stat.isDirectory()) {
			const normalized = toPosixPath(pattern);
			const trailing = normalized.endsWith("/") ? "" : "/";
			return `${normalized}${trailing}**/*.ts`;
		}
	} catch (error) {
		if (!isEnoent(error)) throw error;
	}
	return toPosixPath(pattern);
}

function isEnoent(error: unknown): boolean {
	if (typeof error !== "object" || error === null || !("code" in error)) {
		return false;
	}
	return error.code === "ENOENT";
}

function toPosixPath(p: string): string {
	return p.replaceAll("\\", "/");
}

function buildIgnore(): string[] {
	return [...IGNORED_DIRS.map((d) => `**/${d}/**`), "**/*.d.ts"];
}

function assertWriteSafe(filePath: string): void {
	const segments = resolve(filePath).split(sep);
	if (segments.includes("node_modules") || segments.includes(".git")) {
		throw new Error(`Refusing to write to protected path: ${filePath}`);
	}
}
