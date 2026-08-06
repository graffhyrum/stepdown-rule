import ts from "typescript";
import { buildRuleContext } from "./analyzer";
import { countFunctionMovements } from "./function-movement";
import type { ViolationRule } from "./rule-context";
import type { IFileService } from "./services/types";
import type { FixResult } from "./types";

const defaultPrinter = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });

/**
 * Apply each enabled rule's fix in registry order.
 * Lives outside fixer/pipeline facades so Pipeline can call it without a cycle.
 */
export function fixFileWithRules(params: {
	filePath: string;
	originalContent: string;
	enabledRules: ViolationRule[];
	service: IFileService;
}): FixResult {
	const { filePath, originalContent, enabledRules, service } = params;
	let content = originalContent;
	for (const rule of enabledRules) {
		const parsedFile = service.parseContent(content, filePath);
		const ctx = buildRuleContext(parsedFile);
		const violations = rule.analyze(ctx);
		if (violations.length > 0) {
			content = rule.fix(ctx, violations);
		}
	}
	const fixed = hasPrintToPrintChange(originalContent, content, filePath);
	return {
		file: filePath,
		fixed,
		originalContent,
		fixedContent: content,
		reordered: fixed ? countFunctionMovements(originalContent, content) : 0,
		errors: [],
	};
}

/** True when printing both sides yields different text (never raw !== printed). */
function hasPrintToPrintChange(
	originalContent: string,
	candidateContent: string,
	filePath: string,
): boolean {
	if (originalContent === candidateContent) return false;
	return printSource(originalContent, filePath) !== printSource(candidateContent, filePath);
}

function printSource(content: string, filePath: string): string {
	return defaultPrinter.printFile(
		ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true),
	);
}
