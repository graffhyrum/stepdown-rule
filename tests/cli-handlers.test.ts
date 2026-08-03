import { expect, test } from "bun:test";
import { handleUnexpectedError } from "../src/cli-handlers";
import { ExitInternal } from "../src/exit-codes";
import { createReporter } from "../src/reporter";
import { withCapturedIo } from "./cli-harness";

test("handleUnexpectedError sets INTERNAL exit for human", async () => {
	const { exitCode, stderr } = await withCapturedIo(() => {
		handleUnexpectedError(new Error("boom"), false);
	});
	expect(exitCode).toBe(ExitInternal);
	expect(stderr).toMatch(/INTERNAL_ERROR|boom/);
});

test("handleUnexpectedError uses reporter early failure for agents", async () => {
	const { exitCode, stdout } = await withCapturedIo(() => {
		handleUnexpectedError("string-fail", createReporter("agents"));
	});
	expect(exitCode).toBe(ExitInternal);
	const envelope = JSON.parse(stdout) as { ok: boolean; errors: { code: string }[] };
	expect(envelope.ok).toBe(false);
	expect(envelope.errors[0]?.code).toBe("INTERNAL_ERROR");
});
