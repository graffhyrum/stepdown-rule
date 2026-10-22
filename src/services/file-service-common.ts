import ts from "typescript";
import type { ParsedFile } from "./types";

/** Normalize a filesystem path to POSIX separators. */
export function toPosixPath(p: string): string {
	return p.replaceAll("\\", "/");
}

/** Parse source content into a ParsedFile using the shared TypeScript settings. */
export function parseContent(content: string, filePath: string): ParsedFile {
	const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);
	return { sourceFile, filePath, content };
}
