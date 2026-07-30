/**
 * Cursor stop hook: run `bun vet` after each agent turn.
 * Failures return followup_message (exit 0) so Cursor prompts the agent.
 * Raw non-zero exits fail-open and never reach the agent.
 *
 * Opt-in env:
 * - STEPDOWN_VET_SKIP_NO_CODE=1 — skip vet when git porcelain has no code paths
 * - STEPDOWN_VET_SCRUB_ENV=1 — redact secret-like env values in followup_message
 */
import { stdin } from "bun";

type StopStatus = "completed" | "aborted" | "error";
type StopHookInput = { status: StopStatus };
type StopHookOutput = Record<string, never> | { followup_message: string };

const MAX_OUTPUT_CHARS = 12_000;
const MAX_STDIN_CHARS = 8_192;
const VET_TIMEOUT_MS = 280_000;
const STOP_STATUSES = new Set<string>(["completed", "aborted", "error"]);
const SECRET_ENV_KEY = /(?:SECRET|TOKEN|PASSWORD|API[_-]?KEY|CREDENTIAL|PRIVATE[_-]?KEY|AUTH)/i;
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

	if (input.status !== "completed") {
		emit({});
		return;
	}

	if (process.env.STEPDOWN_VET_SKIP_NO_CODE === "1") {
		const hasCode = await hasRelevantCodeChanges();
		if (!hasCode) {
			console.error("[vet-stop] skip: no code changes (STEPDOWN_VET_SKIP_NO_CODE=1)");
			emit({});
			return;
		}
	}

	try {
		const { exitCode, stdout, stderr } = await runVet();
		if (exitCode === 0) {
			emit({});
			return;
		}
		console.error(`[vet-stop] bun vet exited ${exitCode}`);
		emit({ followup_message: buildFollowup(exitCode, stdout, stderr) });
	} catch (error) {
		console.error("[vet-stop] vet run failed", error);
		emit({
			followup_message: buildFollowup(
				1,
				"",
				error instanceof Error ? error.message : String(error),
			),
		});
	}
}

async function runVet(): Promise<{ exitCode: number; stdout: string; stderr: string }> {
	const proc = Bun.spawn(["bun", "vet"], {
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

export function buildFollowup(exitCode: number, stdout: string, stderr: string): string {
	const combined = [stdout, stderr]
		.filter((s) => s.trim().length > 0)
		.join("\n")
		.trim();
	const body = sanitizeFence(combined || "(no output captured)");
	const truncated = body.length >= MAX_OUTPUT_CHARS ? `…(truncated)\n${body}` : body;
	const message = [
		`Stop hook: \`bun vet\` failed (exit code ${exitCode}).`,
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
	if (env.STEPDOWN_VET_SCRUB_ENV !== "1") {
		return text;
	}
	let out = text;
	for (const [key, value] of Object.entries(env)) {
		if (key === "STEPDOWN_VET_SCRUB_ENV" || key === "STEPDOWN_VET_SKIP_NO_CODE") {
			continue;
		}
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

function porcelainPath(line: string): string | null {
	if (line.length < 4) {
		return null;
	}
	let rest = line.slice(3);
	if (rest.startsWith('"') && rest.endsWith('"')) {
		rest = rest.slice(1, -1).replaceAll('\\"', '"');
	}
	const arrow = rest.lastIndexOf(" -> ");
	const raw = arrow >= 0 ? rest.slice(arrow + 4) : rest;
	return raw.replaceAll("\\", "/");
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
	return parseStopInput(JSON.parse(text));
}

function parseStopInput(value: unknown): StopHookInput {
	if (typeof value !== "object" || value === null || !("status" in value)) {
		throw new Error("stop hook stdin missing status");
	}
	const status = (value as { status: unknown }).status;
	if (typeof status !== "string" || !STOP_STATUSES.has(status)) {
		throw new Error(`invalid stop status: ${String(status)}`);
	}
	return { status: status as StopStatus };
}

function emit(payload: StopHookOutput): void {
	process.stdout.write(`${JSON.stringify(payload)}\n`);
}

if (import.meta.main) {
	await main();
	// Windows: brief pause so Cursor can capture stdout before process exit
	await Bun.sleep(50);
	process.exit(0);
}
