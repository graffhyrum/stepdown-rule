const MOVEMENT_LINE_THRESHOLD = 10;

/** Count function signatures that moved more than {@link MOVEMENT_LINE_THRESHOLD} lines. */
export function countFunctionMovements(original: string, fixed: string): number {
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
