import { minimatch } from "minimatch";
import ts from "typescript";
import type { FileServiceOptions, IFileService, ParsedFile } from "./types";

function toPosixPath(p: string): string {
	return p.replaceAll("\\", "/");
}

/**
 * In-memory {@link IFileService} for unit tests — no disk, no temp dirs.
 */
export class InMemoryFileService implements IFileService {
	private readonly files = new Map<string, string>();
	private readonly ignore: string[];

	constructor(initial: Record<string, string> = {}, options: FileServiceOptions = {}) {
		for (const [path, content] of Object.entries(initial)) {
			this.files.set(toPosixPath(path), content);
		}
		this.ignore = options.ignore ?? [];
	}

	async resolveFiles(patterns: string[]): Promise<string[]> {
		const normalizedPatterns = patterns.map(toPosixPath);
		const matched = new Set<string>();
		for (const path of this.files.keys()) {
			for (const pattern of normalizedPatterns) {
				if (path === pattern || minimatch(path, pattern)) {
					matched.add(path);
				}
			}
		}
		const sorted = [...matched].sort((a, b) => a.localeCompare(b));
		return applyIgnore(sorted, this.ignore);
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
		const key = toPosixPath(filePath);
		const content = this.files.get(key);
		if (content === undefined) {
			throw new Error(`ENOENT: no such file: ${filePath}`);
		}
		return content;
	}

	async writeFile(filePath: string, content: string): Promise<void> {
		this.files.set(toPosixPath(filePath), content);
	}
}

function applyIgnore(paths: string[], patterns: string[]): string[] {
	if (patterns.length === 0) return paths;
	const normalized = patterns.map(toPosixPath);
	return paths.filter((p) => !normalized.some((pat) => minimatch(p, pat)));
}
