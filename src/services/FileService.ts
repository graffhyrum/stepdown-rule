import { readFileSync, writeFileSync } from "node:fs";
import { glob } from "glob";
import ts from "typescript";
import type { FileServiceOptions, IFileService, ParsedFile } from "./types";

export class FileService implements IFileService {
	private ignore: string[];

	constructor(options: FileServiceOptions = {}) {
		this.ignore = options.ignore ?? [];
	}

	async resolveFiles(patterns: string[]): Promise<string[]> {
		const allFiles: string[] = [];
		for (const pattern of patterns) {
			const matches = await glob(pattern, {
				ignore: ["node_modules/**", "dist/**", "coverage/**", "*.d.ts", ...this.ignore],
			});
			allFiles.push(...matches);
		}
		return [...new Set(allFiles)].sort((a, b) => a.localeCompare(b));
	}

	parseFile(filePath: string): ParsedFile {
		const content = this.readFile(filePath);
		return this.parseContent(content, filePath);
	}

	parseContent(content: string, filePath: string): ParsedFile {
		const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);
		return { sourceFile, filePath, content };
	}

	readFile(filePath: string): string {
		return readFileSync(filePath, "utf-8");
	}

	writeFile(filePath: string, content: string): void {
		writeFileSync(filePath, content, "utf-8");
	}
}
