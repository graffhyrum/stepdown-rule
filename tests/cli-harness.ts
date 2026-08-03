import { format } from "node:util";
import { Command, CommanderError } from "commander";
import { createProgram } from "../src/cli-program";

export type CliRunResult = { exitCode: number; stdout: string; stderr: string };

type WriteFn = typeof process.stdout.write;

/** Picocolors caches color support at import; FORCE_COLOR/TTY can still emit ANSI. */
const ESC = String.fromCharCode(0x1b);
const ANSI_RE = new RegExp(`${ESC}\\[[0-9;]*m`, "g");

function stripAnsi(text: string): string {
	return text.replace(ANSI_RE, "");
}

function joinCapturedOutput(chunks: string[]): string {
	return stripAnsi(chunks.join(""));
}

function restoreEnvVar(name: string, previous: string | undefined): void {
	if (previous === undefined) {
		delete process.env[name];
	} else {
		process.env[name] = previous;
	}
}

function applyExitOverride(command: Command): void {
	command.exitOverride();
	for (const sub of command.commands) {
		applyExitOverride(sub);
	}
}

/** Capture stdout/stderr/console while running fn; restore exitCode after. */
export async function withCapturedIo<T>(
	fn: () => T | Promise<T>,
	options: { noColor?: boolean } = {},
): Promise<{ result: T; stdout: string; stderr: string; exitCode: number }> {
	const stdoutChunks: string[] = [];
	const stderrChunks: string[] = [];
	const previousExitCode = process.exitCode;
	const previousNoColor = process.env.NO_COLOR;
	const previousForceColor = process.env.FORCE_COLOR;
	const originalLog = console.log;
	const originalError = console.error;
	const originalStdoutWrite = process.stdout.write.bind(process.stdout) as WriteFn;
	const originalStderrWrite = process.stderr.write.bind(process.stderr) as WriteFn;

	// Bun ignores `process.exitCode = undefined`; must assign 0 to clear.
	process.exitCode = 0;
	if (options.noColor !== false) {
		process.env.NO_COLOR = "1";
		delete process.env.FORCE_COLOR;
	}

	console.log = (...args: unknown[]) => {
		stdoutChunks.push(`${format(...args)}\n`);
	};
	console.error = (...args: unknown[]) => {
		stderrChunks.push(`${format(...args)}\n`);
	};
	process.stdout.write = makeCaptureWrite(stdoutChunks) as WriteFn;
	process.stderr.write = makeCaptureWrite(stderrChunks) as WriteFn;

	try {
		const result = await fn();
		return {
			result,
			exitCode: typeof process.exitCode === "number" ? process.exitCode : 0,
			stdout: joinCapturedOutput(stdoutChunks),
			stderr: joinCapturedOutput(stderrChunks),
		};
	} finally {
		console.log = originalLog;
		console.error = originalError;
		process.stdout.write = originalStdoutWrite;
		process.stderr.write = originalStderrWrite;
		process.exitCode = typeof previousExitCode === "number" ? previousExitCode : 0;
		restoreEnvVar("NO_COLOR", previousNoColor);
		restoreEnvVar("FORCE_COLOR", previousForceColor);
	}
}

export async function runCli(argv: string[]): Promise<CliRunResult> {
	const { exitCode, stdout, stderr } = await withCapturedIo(async () => {
		const program = createProgram();
		applyExitOverride(program);
		try {
			await program.parseAsync(argv, { from: "user" });
		} catch (error) {
			if (!(error instanceof CommanderError)) {
				throw error;
			}
			process.exitCode = error.exitCode;
		}
	});
	return { exitCode, stdout, stderr };
}

function isWriteCallback(v: unknown): v is (err?: Error | null) => void {
	return typeof v === "function";
}

function makeCaptureWrite(chunks: string[]): WriteFn {
	return ((chunk: string | Uint8Array, encodingOrCb?: unknown, cb?: unknown): boolean => {
		// Capture as utf8 text; encoding only matters for real stream writes.
		const text = typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
		chunks.push(text);
		const done = isWriteCallback(encodingOrCb)
			? encodingOrCb
			: isWriteCallback(cb)
				? cb
				: undefined;
		done?.(null);
		return true;
	}) as WriteFn;
}
