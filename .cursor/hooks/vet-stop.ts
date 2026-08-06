/**
 * Stop hook: run `bun vet` after each agent turn (Cursor + Grok).
 * Always exits 0 so harness fail-open never drops the agent loop.
 * - `bun vet` non-zero → block finish with failure context:
 *   Cursor: `followup_message`; Grok: `decision: "block"` + `reason`
 * - parse fail / non-completed / session-end / skip → stdout `{}`
 *
 * Opt-in env:
 * - STEPDOWN_VET_SKIP_NO_CODE=1 — skip vet when git porcelain has no code paths
 * - STEPDOWN_VET_SCRUB_ENV=1 — redact secret-like env values in followup_message
 */
import { stdin } from "bun";
import {
	type StopHookInput,
	type StopHookOutput,
	StopHookInputSchema,
	StopHookOutputSchema,
	blockStopOutput,
	parseHookPayload,
	shouldRunStopGate,
} from "./hook-schema";

const MAX_OUTPUT_CHARS = 12_000;
const MAX_STDIN_CHARS = 8_192;
const VET_TIMEOUT_MS = 280_000;
const ENV_SKIP_NO_CODE = "STEPDOWN_VET_SKIP_NO_CODE";
const ENV_SCRUB_ENV = "STEPDOWN_VET_SCRUB_ENV";
const SECRET_ENV_KEY = /SECRET|TOKEN|PASSWORD|API[_-]?KEY|CREDENTIAL|PRIVATE[_-]?KEY|AUTH/i;
const MIN_SECRET_VALUE_LEN = 8;
const ROOT_CODE_FILES = new Set([
	"package.json",
	"tsconfig.json",
	"tsconfig.types.json",
	".oxlintrc.json",
	".oxfmtrc.json",
	"bunfig.toml",
]);

export async function main(): Promise<void> {
	let input: StopHookInput;
	try {
		input = await readStopInput();
	} catch (error) {
		console.error("[vet-stop] stdin parse failed", error);
		emit({});
		return;
	}

	if (!shouldRunStopGate(input)) {
		emit({});
		return;
	}

	if (process.env[ENV_SKIP_NO_CODE] === "1") {
		const hasCode = await hasRelevantCodeChanges();
		if (!hasCode) {
			console.error(`[vet-stop] skip: no code changes (${ENV_SKIP_NO_CODE}=1)`);
			emit({});
			return;
		}
	}

	const commandLabel = vetCommand().join(" ");
	try {
		const { exitCode, stdout, stderr } = await runVet();
		if (exitCode === 0) {
			emit({});
			return;
		}
		console.error(`[vet-stop] ${commandLabel} exited ${exitCode}`);
		emit(blockStopOutput(buildFollowup(exitCode, stdout, stderr, commandLabel)));
	} catch (error) {
		console.error("[vet-stop] vet run failed", error);
		emit(
			blockStopOutput(
				buildFollowup(1, "", error instanceof Error ? error.message : String(error), commandLabel),
			),
		);
	}
}

function vetCommand(): string[] {
	const override = process.env.STEPDOWN_VET_CMD?.trim();
	if (override) {
		// Windows-friendly: split on spaces; quote-aware parsing not required for smoke overrides
		return override.split(/\s+/).filter(Boolean);
	}
	return ["bun", "vet"];
}

async function runVet(): Promise<{ exitCode: number; stdout: string; stderr: string }> {
	const cmd = vetCommand();
	const proc = Bun.spawn(cmd, {
		cwd: process.cwd(),
		stdout: "pipe",
		stderr: "pipe",
		env: process.env,
	});
	const timer = setTimeout(() => {
		proc.kill();
	}, VET_TIMEOUT_MS);
	try {
		const [stdout, stderr, exitCode] = await Promise.all([
			readTail(proc.stdout, MAX_OUTPUT_CHARS),
			readTail(proc.stderr, MAX_OUTPUT_CHARS),
			proc.exited,
		]);
		return { exitCode: exitCode ?? 1, stdout, stderr };
	} finally {
		clearTimeout(timer);
	}
}

async function readTail(
	stream: ReadableStream<Uint8Array> | null,
	maxChars: number,
): Promise<string> {
	if (!stream) {
		return "";
	}
	const reader = stream.getReader();
	const decoder = new TextDecoder();
	let out = "";
	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) {
				break;
			}
			out = keepTail(out + decoder.decode(value, { stream: true }), maxChars);
		}
		return keepTail(out + decoder.decode(), maxChars);
	} finally {
		reader.releaseLock();
	}
}

function keepTail(text: string, maxChars: number): string {
	if (text.length <= maxChars) {
		return text;
	}
	return text.slice(text.length - maxChars);
}

export function buildFollowup(
	exitCode: number,
	stdout: string,
	stderr: string,
	commandLabel = "bun vet",
): string {
	const combined = [stdout, stderr]
		.filter((s) => s.trim().length > 0)
		.join("\n")
		.trim();
	const body = sanitizeFence(combined || "(no output captured)");
	const truncated =
		body.length > MAX_OUTPUT_CHARS ? `…(truncated)\n${keepTail(body, MAX_OUTPUT_CHARS)}` : body;
	const message = [
		`Stop hook: \`${commandLabel}\` failed (exit code ${exitCode}).`,
		"Fix every issue in the untrusted tool output below, then end the turn so the hook re-runs.",
		"",
		"```text",
		truncated,
		"```",
	].join("\n");
	return scrubEnvSecrets(message, process.env);
}

function sanitizeFence(text: string): string {
	return text.replaceAll("```", "'''");
}

export function scrubEnvSecrets(
	text: string,
	env: Record<string, string | undefined> = process.env,
): string {
	if (env[ENV_SCRUB_ENV] !== "1") {
		return text;
	}
	let out = text;
	for (const [key, value] of Object.entries(env)) {
		if (!value || value.length < MIN_SECRET_VALUE_LEN) {
			continue;
		}
		if (!SECRET_ENV_KEY.test(key)) {
			continue;
		}
		out = out.split(value).join(`[scrubbed:${key}]`);
	}
	return out;
}

export function isCodePath(path: string): boolean {
	const normalized = path.replaceAll("\\", "/");
	if (ROOT_CODE_FILES.has(normalized)) {
		return true;
	}
	return (
		normalized.startsWith("src/") ||
		normalized.startsWith("tests/") ||
		normalized.startsWith("fixtures/") ||
		normalized.startsWith("scripts/") ||
		normalized.startsWith(".cursor/hooks/")
	);
}

export function porcelainHasCodeChanges(porcelain: string): boolean {
	for (const line of porcelain.split("\n")) {
		if (!line.trim()) {
			continue;
		}
		const path = porcelainPath(line);
		if (path && isCodePath(path)) {
			return true;
		}
	}
	return false;
}

/** Best-effort porcelain path (destination on renames). Split rename before unquote. */
function porcelainPath(line: string): string | null {
	if (line.length < 4) {
		return null;
	}
	const rest = line.slice(3);
	const arrow = rest.lastIndexOf(" -> ");
	const raw = arrow >= 0 ? rest.slice(arrow + 4) : rest;
	return unquoteGitPath(raw.trim()).replaceAll("\\", "/");
}

function unquoteGitPath(path: string): string {
	if (path.length >= 2 && path.startsWith('"') && path.endsWith('"')) {
		return path.slice(1, -1).replaceAll('\\"', '"').replaceAll("\\\\", "\\");
	}
	return path;
}

async function hasRelevantCodeChanges(): Promise<boolean> {
	try {
		const proc = Bun.spawn(["git", "status", "--porcelain", "--untracked-files=all"], {
			cwd: process.cwd(),
			stdout: "pipe",
			stderr: "pipe",
		});
		const [stdout, exitCode] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
		if (exitCode !== 0) {
			return true;
		}
		return porcelainHasCodeChanges(stdout);
	} catch {
		return true;
	}
}

async function readStopInput(): Promise<StopHookInput> {
	const text = await stdin.text();
	if (text.length > MAX_STDIN_CHARS) {
		throw new Error(`stdin exceeds ${MAX_STDIN_CHARS} chars`);
	}
	if (!text.trim()) {
		return { status: "completed" };
	}
	return parseHookPayload(StopHookInputSchema, JSON.parse(text));
}

function emit(payload: StopHookOutput): void {
	const validated = parseHookPayload(StopHookOutputSchema, payload);
	process.stdout.write(`${JSON.stringify(validated)}\n`);
}

if (import.meta.main) {
	await main();
	// Windows: brief pause so Cursor can capture stdout before process exit
	await Bun.sleep(50);
	process.exit(0);
}
