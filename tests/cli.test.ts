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

test("fix exits with code 2 when subcommand appears as pattern", async () => {
	const result = await runCli(["fix", "analyze"]);
	expect(result.exitCode).toBe(2);
	expect(result.stderr).toContain("looks like a subcommand");
});

test("agents fix no files yields ok:false envelope", async () => {
	const result = await runCli(["agents", "fix", "fixtures/nonexistent-dir-xyz-abc/**/*.ts"]);
	expect(result.exitCode).toBe(3);
	const envelope = JSON.parse(result.stdout) as { ok: boolean; errors: { code: string }[] };
	expect(envelope.ok).toBe(false);
	expect(envelope.errors.some((e) => e.code === "NO_FILES")).toBe(true);
});

test("analyze --config invalid JSON exits CONFIG_ERROR", async () => {
	await withTempFile("{ broken", async (configPath) => {
		const result = await runCli(["analyze", CLEAN_FIXTURE, "--config", configPath]);
		expect(result.exitCode).toBe(4);
		expect(result.stderr).toMatch(/CONFIG_ERROR|Invalid JSON/);
	});
});

test("fix --config schema failure exits CONFIG_ERROR", async () => {
	await withTempFile(JSON.stringify({ ignore: 1 }), async (configPath) => {
		const result = await runCli(["fix", CLEAN_FIXTURE, "--config", configPath]);
		expect(result.exitCode).toBe(4);
		expect(result.stderr).toMatch(/CONFIG_ERROR|Config validation failed/);
	});
});

for (const target of ["config", "analyze-output", "fix-output"] as const) {
	test(`agents schema ${target} emits JSON Schema`, async () => {
		const result = await runCli(["agents", "schema", target]);
		expect(result.exitCode).toBe(0);
		expect(JSON.parse(result.stdout)).toBeDefined();
	});
}

test("agents schema unknown target exits USAGE", async () => {
	const result = await runCli(["agents", "schema", "not-a-target"]);
	expect(result.exitCode).toBe(2);
	expect(result.stderr).toContain("Unknown schema target");
});

for (const command of ["analyze", "fix"] as const) {
	test(`agents ${command} no files yields ok:false envelope`, async () => {
		const result = await runCli([
			"agents",
			command,
			"fixtures/nonexistent-dir-xyz-abc/**/*.ts",
		]);
		expect(result.exitCode).toBe(3);
		const envelope = JSON.parse(result.stdout) as { ok: boolean; errors: { code: string }[] };
		expect(envelope.ok).toBe(false);
		expect(envelope.errors.some((e) => e.code === "NO_FILES")).toBe(true);
	});
}

test("agents analyze bad config yields ok:false CONFIG_ERROR", async () => {
	await withTempFile(
		"{",
		async (configPath) => {
			const result = await runCli(["agents", "analyze", CLEAN_FIXTURE, "--config", configPath]);
			expect(result.exitCode).toBe(4);
			const envelope = JSON.parse(result.stdout) as { ok: boolean; errors: { code: string }[] };
			expect(envelope.ok).toBe(false);
			expect(envelope.errors.some((e) => e.code === "CONFIG_ERROR")).toBe(true);
		},
		undefined,
		"rc.json",
	);
});

test("json analyze includes nestedFunctionViolations shape", async () => {
	const result = await runCli(["analyze", NESTED_FIXTURE, "--json"]);
	expect(result.exitCode).toBe(1);
	const data = JSON.parse(result.stdout) as {
		nestedFunctionViolations: { kind: string; nested: { name: string }; parent: { name: string } }[];
	}[];
	const nested = data[0]?.nestedFunctionViolations ?? [];
	expect(nested.length).toBeGreaterThan(0);
	expect(nested[0]?.kind).toBe("nested");
	expect(nested[0]?.nested.name).toBe("helper");
	expect(nested[0]?.parent.name).toBe("parent");
});

test("human analyze reports nested violation with parent line", async () => {
	const result = await runCli(["analyze", NESTED_FIXTURE]);
	expect(result.exitCode).toBe(1);
	expect(result.stdout).toContain("should appear after all logic");
	expect(result.stdout).toContain("parent function:");
});

test("analyze --verbose shows circular dependencies", async () => {
	const result = await runCli(["analyze", "fixtures/test-circular.ts", "--verbose"]);
	expect(result.exitCode).toBe(0);
	expect(result.stdout).toMatch(/Circular dependency/i);
});

test("fix --json emits FixResult array", async () => {
	const original = await Bun.file(NESTED_FIXTURE).text();
	await withTempFile(original, async (file) => {
		const result = await runCli(["fix", file, "--json", "--dry-run"]);
		expect(result.exitCode).toBe(0);
		const data = JSON.parse(result.stdout) as {
			file: string;
			fixed: boolean;
			reordered: number;
			errors: string[];
		}[];
		expect(Array.isArray(data)).toBe(true);
		expect(data[0]?.fixed).toBe(true);
		expect(data[0]?.errors).toEqual([]);
	});
});

test("agents fix --include-content includes bodies", async () => {
	const original = await Bun.file(NESTED_FIXTURE).text();
	await withTempFile(original, async (file) => {
		const result = await runCli(["agents", "fix", file, "--dry-run", "--include-content"]);
		expect(result.exitCode).toBe(0);
		const envelope = JSON.parse(result.stdout) as {
			results: { originalContent?: string; fixedContent?: string; fixed: boolean }[];
		};
		const fixResult = envelope.results[0];
		expect(fixResult?.fixed).toBe(true);
		expect(fixResult?.originalContent).toBeDefined();
		expect(fixResult?.fixedContent).toBeDefined();
		expect(fixResult?.originalContent).not.toBe(fixResult?.fixedContent);
	});
});

test("analyze --rules filters enabled rules", async () => {
	const result = await runCli(["analyze", NESTED_FIXTURE, "--rules", " nested ", "--json"]);
	expect(result.exitCode).toBe(1);
	const data = JSON.parse(result.stdout) as {
		violations: unknown[];
		nestedFunctionViolations: unknown[];
	}[];
	expect(data[0]?.violations).toHaveLength(0);
	expect((data[0]?.nestedFunctionViolations ?? []).length).toBeGreaterThan(0);
});

