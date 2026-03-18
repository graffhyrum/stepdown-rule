import { expect, test } from "bun:test";

test("exits with code 2 when subcommand appears as pattern", () => {
	const proc = Bun.spawnSync(["bun", "run", "src/cli.ts", ".", "fix"]);
	expect(proc.exitCode).toBe(2);
	expect(proc.stderr.toString()).toContain("looks like a subcommand");
});

test("exits with code 2 when 'analyze' appears as pattern", () => {
	const proc = Bun.spawnSync(["bun", "run", "src/cli.ts", ".", "analyze"]);
	expect(proc.exitCode).toBe(2);
	expect(proc.stderr.toString()).toContain("looks like a subcommand");
});

test("normal fix subcommand still works", () => {
	const proc = Bun.spawnSync(["bun", "run", "src/cli.ts", "fix", "nonexistent-*.ts"]);
	// Should not error with exit code 2 — just find no files
	expect(proc.exitCode).not.toBe(2);
});
