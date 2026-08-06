import { type } from "arktype";
import { describe, expect, test } from "bun:test";
import {
	blockStopOutput, CommonHookInputSchema,
	parseHookPayload, shouldRunStopGate,
	StopHookInputSchema,
	StopHookOutputSchema
} from "../.cursor/hooks/hook-schema";
import {
	buildFollowup,
	isCodePath,
	porcelainHasCodeChanges,
	scrubEnvSecrets
} from "../.cursor/hooks/vet-stop";

describe("isCodePath", () => {
	test("accepts src tests fixtures scripts hooks and root configs", () => {
		expect(isCodePath("src/cli.ts")).toBe(true);
		expect(isCodePath("tests/fixer.test.ts")).toBe(true);
		expect(isCodePath("fixtures/stepdown-basic.ts")).toBe(true);
		expect(isCodePath("scripts/build.ts")).toBe(true);
		expect(isCodePath(".cursor/hooks/vet-stop.ts")).toBe(true);
		expect(isCodePath("package.json")).toBe(true);
		expect(isCodePath("tsconfig.json")).toBe(true);
	});

	test("rejects docs beads and nested package.json", () => {
		expect(isCodePath("docs/PRD.md")).toBe(false);
		expect(isCodePath(".beads/issues.jsonl")).toBe(false);
		expect(isCodePath("packages/foo/package.json")).toBe(false);
		expect(isCodePath("README.md")).toBe(false);
	});

	test("normalizes backslashes", () => {
		expect(isCodePath("src\\cli.ts")).toBe(true);
	});
});

describe("porcelainHasCodeChanges", () => {
	test("true when code path dirty", () => {
		expect(porcelainHasCodeChanges(" M src/cli.ts\n")).toBe(true);
		expect(porcelainHasCodeChanges("?? tests/new.test.ts\n")).toBe(true);
		expect(porcelainHasCodeChanges("R  src/a.ts -> src/b.ts\n")).toBe(true);
		expect(porcelainHasCodeChanges('?? "src/has space.ts"\n')).toBe(true);
		expect(porcelainHasCodeChanges('R  "src/old name.ts" -> "src/new name.ts"\n')).toBe(true);
	});

	test("false for empty or non-code dirt", () => {
		expect(porcelainHasCodeChanges("")).toBe(false);
		expect(porcelainHasCodeChanges(" M docs/PRD.md\n M .beads/issues.jsonl\n")).toBe(false);
	});
});

describe("scrubEnvSecrets", () => {
	test("no-op unless scrub env enabled", () => {
		const text = "token=supersecretvalue";
		expect(
			scrubEnvSecrets(text, {
				API_TOKEN: "supersecretvalue",
			}),
		).toBe(text);
	});

	test("redacts secret-like env values when enabled", () => {
		const out = scrubEnvSecrets("leak supersecretvalue here", {
			STEPDOWN_VET_SCRUB_ENV: "1",
			API_TOKEN: "supersecretvalue",
			PATH: "/usr/bin",
			SHORT: "abc",
		});
		expect(out).toContain("[scrubbed:API_TOKEN]");
		expect(out).not.toContain("supersecretvalue");
		expect(out).toContain("leak ");
	});

	test("skips non-secret keys and short values", () => {
		const text = "HOME=/Users/me/project and SHORT=abcdefg";
		expect(
			scrubEnvSecrets(text, {
				STEPDOWN_VET_SCRUB_ENV: "1",
				HOME: "/Users/me/project",
				SHORT: "abcdefg",
			}),
		).toBe(text);
	});
});

describe("buildFollowup", () => {
	test("wraps failure output in fenced text block", () => {
		const msg = buildFollowup(2, "oops", "");
		expect(msg).toContain("exit code 2");
		expect(msg).toContain("```text");
		expect(msg).toContain("oops");
	});

	test("keeps tail of oversized combined output", () => {
		const head = `HEAD_MARKER_${"x".repeat(10_000)}`;
		const tail = `${"y".repeat(10_000)}_TAIL_MARKER`;
		const msg = buildFollowup(1, head, tail);
		expect(msg).toContain("…(truncated)");
		expect(msg).toContain("_TAIL_MARKER");
		expect(msg).not.toContain("HEAD_MARKER_");
	});

	test("neutralizes nested fences in tool output", () => {
		const msg = buildFollowup(1, "before ``` inject after", "");
		expect(msg).toContain("before ''' inject after");
		expect(msg).not.toContain("before ``` inject");
	});
});

describe("hook-schema stop I/O", () => {
	test("parses minimal and full stop input", () => {
		expect(parseHookPayload(StopHookInputSchema, { status: "completed" })).toEqual({
			status: "completed",
		});
		const full = parseHookPayload(StopHookInputSchema, {
			conversation_id: "conv-1",
			generation_id: "gen-1",
			model: "composer",
			model_id: "composer-1",
			model_params: [{ id: "effort", value: "max" }],
			hook_event_name: "stop",
			cursor_version: "1.7.2",
			workspace_roots: ["/proj"],
			user_email: null,
			transcript_path: null,
			status: "error",
			loop_count: 2,
		});
		expect(full.status).toBe("error");
		expect(full.loop_count).toBe(2);
		expect(full.workspace_roots).toEqual(["/proj"]);
	});

	test("rejects invalid stop status", () => {
		expect(() => parseHookPayload(StopHookInputSchema, { status: "nope" })).toThrow();
	});

	test("rejects negative loop_count", () => {
		expect(() =>
			parseHookPayload(StopHookInputSchema, { status: "completed", loop_count: -1 }),
		).toThrow();
	});

	test("stop output accepts empty, followup, or dual block payload", () => {
		expect(parseHookPayload(StopHookOutputSchema, {})).toEqual({});
		expect(parseHookPayload(StopHookOutputSchema, { followup_message: "retry" })).toEqual({
			followup_message: "retry",
		});
		const blocked = blockStopOutput("fix vet");
		expect(parseHookPayload(StopHookOutputSchema, blocked)).toEqual({
			decision: "block",
			reason: "fix vet",
			followup_message: "fix vet",
		});
	});

	test("shouldRunStopGate honors Cursor status and Grok reason", () => {
		expect(shouldRunStopGate({ status: "completed" })).toBe(true);
		expect(shouldRunStopGate({ status: "aborted" })).toBe(false);
		expect(shouldRunStopGate({ reason: "end_turn" })).toBe(true);
		expect(shouldRunStopGate({ reason: "channel_closed" })).toBe(false);
		expect(shouldRunStopGate({ reason: "end_turn", status: "completed" })).toBe(true);
		expect(shouldRunStopGate({})).toBe(true);
	});

	test("parses Grok stop envelope without status", () => {
		const input = parseHookPayload(StopHookInputSchema, {
			hookEventName: "stop",
			reason: "end_turn",
			stopHookActive: false,
			sessionId: "s1",
			workspaceRoot: "/proj",
		});
		expect(input.reason).toBe("end_turn");
		expect(input.stopHookActive).toBe(false);
	});

	test("CommonHookInputSchema.merge composes hook-specific fields", () => {
		const Schema = CommonHookInputSchema.merge(type({ tool_name: "string" }));
		const value = parseHookPayload(Schema, {
			conversation_id: "c",
			tool_name: "Shell",
		});
		expect(value.tool_name).toBe("Shell");
		expect(value.conversation_id).toBe("c");
		expect(parseHookPayload(CommonHookInputSchema, { model: "x" }).model).toBe("x");
	});
});
