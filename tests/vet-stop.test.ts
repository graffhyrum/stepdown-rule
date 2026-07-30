import { describe, expect, test } from "bun:test";
import {
	buildFollowup,
	isCodePath,
	porcelainHasCodeChanges,
	scrubEnvSecrets,
} from "../.cursor/hooks/vet-stop";

describe("isCodePath", () => {
	test("accepts src tests scripts hooks and root configs", () => {
		expect(isCodePath("src/cli.ts")).toBe(true);
		expect(isCodePath("tests/fixer.test.ts")).toBe(true);
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
	});

	test("false for empty or non-code dirt", () => {
		expect(porcelainHasCodeChanges("")).toBe(false);
		expect(porcelainHasCodeChanges(" M docs/PRD.md\n M .beads/issues.jsonl\n")).toBe(false);
	});
});

describe("scrubEnvSecrets", () => {
	test("no-op unless STEPDOWN_VET_SCRUB_ENV=1", () => {
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
});
