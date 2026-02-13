import type { SourceFile } from "typescript";

export interface FileServiceOptions {
	ignore?: string[];
}

export interface ParsedFile {
	sourceFile: SourceFile;
	filePath: string;
	content: string;
}

export interface IFileService {
	resolveFiles(patterns: string[]): Promise<string[]>;
	parseFile(filePath: string): ParsedFile;
	parseContent(content: string, filePath: string): ParsedFile;
	writeFile(filePath: string, content: string): void;
	readFile(filePath: string): string;
}
