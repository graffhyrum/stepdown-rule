import { lstat } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { type IgnoreLike, glob } from "glob";
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
		const ignore = buildIgnore();
		const results = await Promise.all(expanded.map((p) => glob(p, { ignore })));
		const unique = [...new Set(results.flat())].sort((a, b) => a.localeCompare(b));
		return applyUserIgnore(unique, this.ignore);
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

async function normalizePattern(pattern: string): Promise<string> {
	try {
		const stat = await lstat(pattern);
		if (stat.isDirectory()) {
			const trailing = pattern.endsWith("/") ? "" : "/";
			return `${pattern}${trailing}**/*.ts`;
		}
	} catch {
		/* not a filesystem path — use as glob */
	}
	return pattern;
}

function buildIgnore(): IgnoreLike {
	const isDirIgnored = (p: { isNamed(n: string): boolean }): boolean =>
		IGNORED_DIRS.some((d) => p.isNamed(d));
	return {
		childrenIgnored: isDirIgnored,
		ignored(p) {
			return isDirIgnored(p) || p.name.endsWith(".d.ts");
		},
	};
}

function applyUserIgnore(paths: string[], patterns: string[]): string[] {
	if (patterns.length === 0) return paths;
	return paths.filter((p) => !patterns.some((pat) => minimatch(p, pat)));
}

function assertWriteSafe(filePath: string): void {
	const segments = resolve(filePath).split(sep);
	if (segments.includes("node_modules") || segments.includes(".git")) {
		throw new Error(`Refusing to write to protected path: ${filePath}`);
	}
}
