import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { FileService } from "../src/services/FileService";

let tmpDir: string;

beforeEach(() => {
	tmpDir = mkdtempSync(join(tmpdir(), "fs-test-"));
});

afterEach(() => {
	rmSync(tmpDir, { recursive: true });
});

describe("FileService.resolveFiles", () => {
	test("absolute path input excludes node_modules and .d.ts", async () => {
		writeFileSync(join(tmpDir, "app.ts"), "export const x = 1;");
		writeFileSync(join(tmpDir, "types.d.ts"), "declare const y: number;");
		mkdirSync(join(tmpDir, "node_modules", "pkg"), { recursive: true });
		writeFileSync(join(tmpDir, "node_modules", "pkg", "index.ts"), "export {}");

		const service = new FileService();
		const files = await service.resolveFiles([tmpDir]);

		expect(files).toEqual([join(tmpDir, "app.ts")]);
	});

	test("relative path input still excludes node_modules", async () => {
		const cwd = process.cwd();
		try {
			process.chdir(tmpDir);
			writeFileSync(join(tmpDir, "main.ts"), "const a = 1;");
			mkdirSync(join(tmpDir, "node_modules", "lib"), { recursive: true });
			writeFileSync(join(tmpDir, "node_modules", "lib", "mod.ts"), "export {}");

			const service = new FileService();
			const files = await service.resolveFiles(["."]);

			expect(files).toEqual(["main.ts"]);
		} finally {
			process.chdir(cwd);
		}
	});

	test("user-supplied ignore patterns exclude matching files", async () => {
		writeFileSync(join(tmpDir, "keep.ts"), "export const k = 1;");
		writeFileSync(join(tmpDir, "skip.ts"), "export const s = 2;");

		const service = new FileService({ ignore: ["**/skip.ts"] });
		const files = await service.resolveFiles([tmpDir]);

		expect(files).toEqual([join(tmpDir, "keep.ts")]);
	});
});

describe("FileService.writeFile", () => {
	test("rejects when writing to node_modules", async () => {
		const service = new FileService();
		const target = join(tmpDir, "node_modules", "bad.ts");

		expect(service.writeFile(target, "bad")).rejects.toThrow("protected path");
	});

	test("rejects when writing to .git", async () => {
		const service = new FileService();
		const target = join(tmpDir, ".git", "config");

		expect(service.writeFile(target, "bad")).rejects.toThrow("protected path");
	});
});
