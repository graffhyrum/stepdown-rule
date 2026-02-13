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
		await Bun.write(filePath, content);
	}
}
