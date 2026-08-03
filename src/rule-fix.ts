import ts from "typescript";
import { buildRuleContext } from "./analyzer";
import type { ViolationRule } from "./rule-context";
import type { IFileService } from "./services/types";
import type { FixResult } from "./types";

const defaultPrinter = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
const MOVEMENT_LINE_THRESHOLD = 10;

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

function countFunctionMovements(original: string, fixed: string): number {
	const originalPositions = buildPositionMap(original);
	const fixedLines = fixed.split("\n");
	const occurrence = new Map<string, number>();
	let reorders = 0;
	for (const [index, line] of fixedLines.entries()) {
		const trimmed = line.trim();
		if (!isFunctionSignature(trimmed)) {
			continue;
		}
		const occ = occurrence.get(trimmed) ?? 0;
		occurrence.set(trimmed, occ + 1);
		const originalPos = originalPositions.get(positionKey(occ, trimmed));
		if (originalPos !== undefined && Math.abs(originalPos - index) > MOVEMENT_LINE_THRESHOLD) {
			reorders++;
		}
	}
	return reorders;
}

function buildPositionMap(content: string): Map<string, number> {
	const positions = new Map<string, number>();
	const occurrence = new Map<string, number>();
	const lines = content.split("\n");
	lines.forEach((line, index) => {
		const trimmed = line.trim();
		if (isFunctionSignature(trimmed)) {
			const occ = occurrence.get(trimmed) ?? 0;
			occurrence.set(trimmed, occ + 1);
			positions.set(positionKey(occ, trimmed), index);
		}
	});
	return positions;
}

function positionKey(occurrence: number, trimmed: string): string {
	return `${occurrence}:${trimmed}`;
}

function isFunctionSignature(trimmed: string): boolean {
	return (
		trimmed.startsWith("function ") || (trimmed.startsWith("const ") && trimmed.includes("=>"))
	);
}
