export type CliErrorCode = "CONFIG_ERROR" | "NO_FILES" | "USAGE" | "INTERNAL_ERROR";

export interface CliErrorPayload {
	code: CliErrorCode;
	message: string;
	hint?: string;
}

export function emitCliError(payload: CliErrorPayload): void {
	const parts = [payload.message];
	if (payload.hint) parts.push(`Hint: ${payload.hint}`);
	console.error(parts.join("\n"));
}
