import { expect, test } from "bun:test";

import { join } from "node:path";

const CLI = ["bun", join(import.meta.dir, "../src/cli.ts")];

test("exits with code 2 when subcommand appears as pattern", () => {
	const proc = Bun.spawnSync([...CLI, ".", "fix"]);
	expect(proc.exitCode).toBe(2);
	expect(proc.stderr.toString()).toContain("looks like a subcommand");
});

test("exits with code 2 when 'analyze' appears as pattern", () => {
	const proc = Bun.spawnSync([...CLI, ".", "analyze"]);
	expect(proc.exitCode).toBe(2);
	expect(proc.stderr.toString()).toContain("looks like a subcommand");
});

test("exits with code 3 when no files match", () => {
	const proc = Bun.spawnSync([
		...CLI,
		"analyze",
		"fixtures/nonexistent-dir-xyz-abc/**/*.ts",
	]);
	expect(proc.exitCode).toBe(3);
	expect(proc.stderr.toString()).toContain("No files matched");
});

test("json analyze keeps stdout pure when no files match", () => {
	const proc = Bun.spawnSync([
		...CLI,
		"analyze",
		"fixtures/nonexistent-dir-xyz-abc/**/*.ts",
		"--json",
	]);
	expect(proc.exitCode).toBe(3);
	expect(proc.stdout.toString().trim()).toBe("[]");
	expect(proc.stderr.toString()).toContain("No files matched");
});

const STEP_DOWN_FIXTURE = "fixtures/test-violations.ts";
const NESTED_FIXTURE = "fixtures/test-nested-violation.ts";

test("json analyze serializes dependencyGraph as record", () => {
	const proc = Bun.spawnSync([...CLI, "analyze", STEP_DOWN_FIXTURE, "--json"]);
	expect(proc.exitCode).toBe(1);
	const data = JSON.parse(proc.stdout.toString()) as {
		dependencyGraph?: Record<string, string[]>;
		violations: { file: string }[];
	}[];
	expect(data[0]?.violations[0]?.file).toBe(STEP_DOWN_FIXTURE);
	const graph = data[0]?.dependencyGraph;
	expect(graph).toBeDefined();
	expect(typeof graph).toBe("object");
	expect(Array.isArray(Object.keys(graph ?? {}))).toBe(true);
});

test("agents analyze emits envelope on stdout", () => {
	const proc = Bun.spawnSync([...CLI, "agents", "analyze", STEP_DOWN_FIXTURE]);
	expect(proc.exitCode).toBe(1);
	const envelope = JSON.parse(proc.stdout.toString());
	expect(envelope.schemaVersion).toBe(1);
	expect(envelope.command).toBe("agents/analyze");
	expect(envelope.summary.violations).toBeGreaterThan(0);
	expect(envelope.exitCode).toBe(1);
});

test("agents fix dry-run includes preview without writing", () => {
	const proc = Bun.spawnSync([...CLI, "agents", "fix", NESTED_FIXTURE, "--dry-run"]);
	expect(proc.exitCode).toBe(0);
	const envelope = JSON.parse(proc.stdout.toString());
	expect(envelope.command).toBe("agents/fix");
	const result = envelope.results[0];
	expect(result.fixed).toBe(true);
	expect(result.preview).toBeDefined();
	expect(result.originalContent).toBeUndefined();
});

test("agents schema rules lists stepdown and nested", () => {
	const proc = Bun.spawnSync([...CLI, "agents", "schema", "rules"]);
	expect(proc.exitCode).toBe(0);
	const rules = JSON.parse(proc.stdout.toString()) as { id: string }[];
	const ids = rules.map((r) => r.id).sort();
	expect(ids).toEqual(["nested", "stepdown"]);
});

test("normal fix subcommand still works", () => {
	const proc = Bun.spawnSync([...CLI, "fix", "fixtures/nonexistent-dir-xyz-abc/**/*.ts"]);
	expect(proc.exitCode).toBe(3);
});
