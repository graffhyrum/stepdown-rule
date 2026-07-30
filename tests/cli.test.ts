import { readFileSync } from "node:fs";
import { beforeAll, expect, test } from "bun:test";
import { registerDefaultRules } from "../src/register-default-rules";
import { clear } from "../src/registry";
import { runCli } from "./cli-harness";
import { withTempFile } from "./helpers";

beforeAll(() => {
	clear();
	registerDefaultRules();
});

test("exits with code 2 when subcommand appears as pattern", async () => {
	const result = await runCli([".", "fix"]);
	expect(result.exitCode).toBe(2);
	expect(result.stderr).toContain("looks like a subcommand");
});

test("exits with code 2 when 'analyze' appears as pattern", async () => {
	const result = await runCli([".", "analyze"]);
	expect(result.exitCode).toBe(2);
	expect(result.stderr).toContain("looks like a subcommand");
});

test("exits with code 3 when no files match", async () => {
	const result = await runCli(["analyze", "fixtures/nonexistent-dir-xyz-abc/**/*.ts"]);
	expect(result.exitCode).toBe(3);
	expect(result.stderr).toContain("No files matched");
});

test("json analyze keeps stdout pure when no files match", async () => {
	const result = await runCli([
		"analyze",
		"fixtures/nonexistent-dir-xyz-abc/**/*.ts",
		"--json",
	]);
	expect(result.exitCode).toBe(3);
	expect(result.stdout.trim()).toBe("[]");
	expect(result.stderr).toContain("No files matched");
});

const STEP_DOWN_FIXTURE = "fixtures/test-violations.ts";
const NESTED_FIXTURE = "fixtures/test-nested-violation.ts";
const CLEAN_FIXTURE = "fixtures/clean.ts";
const VIOLATION_FIXTURE = "fixtures/stepdown-violation.ts";

test("json analyze serializes dependencyGraph as record", async () => {
	const result = await runCli(["analyze", STEP_DOWN_FIXTURE, "--json"]);
	expect(result.exitCode).toBe(1);
	const data = JSON.parse(result.stdout) as {
		dependencyGraph?: Record<string, string[]>;
		violations: { file: string }[];
	}[];
	expect(data[0]?.violations[0]?.file).toBe(STEP_DOWN_FIXTURE);
	const graph = data[0]?.dependencyGraph;
	expect(graph).toBeDefined();
	expect(typeof graph).toBe("object");
	expect(Array.isArray(Object.keys(graph ?? {}))).toBe(true);
});

test("agents analyze emits envelope on stdout", async () => {
	const result = await runCli(["agents", "analyze", STEP_DOWN_FIXTURE]);
	expect(result.exitCode).toBe(1);
	const envelope = JSON.parse(result.stdout);
	expect(envelope.schemaVersion).toBe(1);
	expect(envelope.command).toBe("agents/analyze");
	expect(envelope.summary.violations).toBeGreaterThan(0);
	expect(envelope.exitCode).toBe(1);
});

test("agents fix dry-run includes preview without writing", async () => {
	const result = await runCli(["agents", "fix", NESTED_FIXTURE, "--dry-run"]);
	expect(result.exitCode).toBe(0);
	const envelope = JSON.parse(result.stdout);
	expect(envelope.command).toBe("agents/fix");
	const fixResult = envelope.results[0];
	expect(fixResult.fixed).toBe(true);
	expect(fixResult.preview).toBeDefined();
	expect(fixResult.originalContent).toBeUndefined();
});

test("fix --help documents --dry-run", async () => {
	const result = await runCli(["fix", "--help"]);
	expect(result.exitCode).toBe(0);
	expect(result.stdout).toContain("--dry-run");
	expect(result.stdout).toContain("Preview changes without writing files");
});

test("fix --dry-run prints diffs and does not write", async () => {
	const original = await Bun.file(NESTED_FIXTURE).text();
	await withTempFile(original, async (file) => {
		const result = await runCli(["fix", file, "--dry-run"]);
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("Would fix:");
		expect(result.stdout).toMatch(/^[+-] /m);
		expect(await Bun.file(file).text()).toBe(original);
	});
});

test("fix without --dry-run writes files", async () => {
	const original = await Bun.file(NESTED_FIXTURE).text();
	await withTempFile(original, async (file) => {
		const result = await runCli(["fix", file]);
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("Fixed:");
		expect(result.stdout).not.toContain("Would fix:");
		expect(await Bun.file(file).text()).not.toBe(original);
	});
});

test("normal fix subcommand still works", async () => {
	const result = await runCli(["fix", "fixtures/nonexistent-dir-xyz-abc/**/*.ts"]);
	expect(result.exitCode).toBe(3);
});

test("fix on clean fixture exits 0", async () => {
	const result = await runCli(["fix", CLEAN_FIXTURE]);
	expect(result.exitCode).toBe(0);
	expect(result.stdout).toContain("No files needed fixing");
});

test("agents schema rules lists stepdown and nested", async () => {
	const result = await runCli(["agents", "schema", "rules"]);
	expect(result.exitCode).toBe(0);
	const rules = JSON.parse(result.stdout) as { id: string }[];
	const ids = rules.map((r) => r.id).sort();
	expect(ids).toEqual(["nested", "stepdown"]);
});

const FORMATS = ["human", "json", "agents"] as const;

function loadGolden(
	name: string,
	format: (typeof FORMATS)[number],
): { stdout: string; exitCode: number } {
	const base = `tests/goldens/analyze-${name}-${format}`;
	return {
		stdout: readFileSync(`${base}.txt`, "utf8"),
		exitCode: Number(readFileSync(`${base}.exit`, "utf8")),
	};
}

for (const format of FORMATS) {
	test(`--format ${format} on clean.ts matches golden`, async () => {
		const golden = loadGolden("clean", format);
		const result = await runCli(["analyze", CLEAN_FIXTURE, "--format", format]);
		expect(result.exitCode).toBe(golden.exitCode);
		expect(result.stdout).toBe(golden.stdout);
	});

	test(`--format ${format} on stepdown-violation.ts matches golden`, async () => {
		const golden = loadGolden("stepdown-violation", format);
		const result = await runCli(["analyze", VIOLATION_FIXTURE, "--format", format]);
		expect(result.exitCode).toBe(golden.exitCode);
		expect(result.stdout).toBe(golden.stdout);
	});
}
