/**
 * Agent-hook I/O schemas (ArkType).
 * Cursor: https://cursor.com/docs/hooks#reference
 * Grok: ~/.grok/docs/user-guide/10-hooks.md (Stop decision control)
 *
 * Compose: `CommonHookInputSchema.merge(type({ …hook fields }))`.
 */
import { type, type Type } from "arktype";

export const ModelParamSchema = type({
	id: "string",
	value: "string",
});

export type ModelParam = typeof ModelParamSchema.infer;

/**
 * Base agent-hook input. Fields optional so scripts fail-open when a harness
 * omits them or tests pass a subset. Extra keys kept (ArkType default).
 */
export const CommonHookInputSchema = type({
	"conversation_id?": "string",
	"generation_id?": "string",
	"model?": "string",
	"model_id?": "string",
	"model_params?": ModelParamSchema.array(),
	"hook_event_name?": "string",
	"cursor_version?": "string",
	"workspace_roots?": "string[]",
	"user_email?": "string | null",
	"transcript_path?": "string | null",
});

export type CommonHookInput = typeof CommonHookInputSchema.infer;

/** Shared by stop / subagentStop completion status (Cursor). */
export const HookRunStatusSchema = type("'completed' | 'aborted' | 'error'");

export type HookRunStatus = typeof HookRunStatusSchema.infer;

/**
 * stop stdin fields for Cursor + Grok.
 * - Cursor: `status` required in practice; `loop_count` for follow-up loops
 * - Grok: `reason` (`end_turn` vs session-end), `stopHookActive`, camelCase envelope
 */
export const StopHookFieldsSchema = type({
	"status?": HookRunStatusSchema,
	"loop_count?": "number.integer >= 0",
	/** Grok: only gate genuine turn ends (`end_turn`), not session-end fires. */
	"reason?": "string",
	"stopHookActive?": "boolean",
	"hookEventName?": "string",
	"sessionId?": "string",
	"cwd?": "string",
	"workspaceRoot?": "string",
	"lastAssistantMessage?": "string",
});

export type StopHookFields = typeof StopHookFieldsSchema.infer;

export const StopHookInputSchema = CommonHookInputSchema.merge(StopHookFieldsSchema);

export type StopHookInput = typeof StopHookInputSchema.infer;

/**
 * Dual-harness stop stdout.
 * - Cursor: non-empty `followup_message` auto-submits next user turn
 * - Grok: `decision: "block"` + `reason` blocks stop and feeds reason to the agent
 */
export const StopHookOutputSchema = type({
	"followup_message?": "string",
	"decision?": "'block'",
	"reason?": "string",
});

export type StopHookOutput = typeof StopHookOutputSchema.infer;

/** Parse untrusted payload at the hook I/O boundary. */
export function parseHookPayload<t>(schema: Type<t>, value: unknown): Type<t>["inferOut"] {
	return schema.assert(value);
}

/** Whether this stop event should run the quality gate. */
export function shouldRunStopGate(input: StopHookInput): boolean {
	// Grok session-end observe fires with reason other than end_turn
	// Cursor: only completed agent turns
	return (
		(input.reason === undefined || input.reason === "end_turn") &&
		(input.status === undefined || input.status === "completed")
	);
}

/** Failure payload understood by both Cursor (followup) and Grok (block decision). */
export function blockStopOutput(message: string): StopHookOutput {
	return {
		decision: "block",
		reason: message,
		followup_message: message,
	};
}
