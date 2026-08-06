import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileService } from "../src/services/FileService";

function toPosixPath(p: string): string {
	return p.replaceAll("\\", "/");
}

let tmpDir: string;

beforeEach(() => {
	tmpDir = mkdtempSync(join(tmpdir(), "fs-test-"));
});

afterEach(() => {
	rmSync(tmpDir, { recursive: true });
});

describe("FileService.resolveFiles", () => {
	test("absolute path input excludes node_modules and .d.ts", async () => {
		await Bun.write(join(tmpDir, "app.ts"), "export const x = 1;");
		await Bun.write(join(tmpDir, "types.d.ts"), "declare const y: number;");
		mkdirSync(join(tmpDir, "node_modules", "pkg"), { recursive: true });
		await Bun.write(join(tmpDir, "node_modules", "pkg", "index.ts"), "export {}");

		const service = new FileService();
		const files = await service.resolveFiles([tmpDir]);

		expect(files).toEqual([toPosixPath(join(tmpDir, "app.ts"))]);
	});

	test("relative path input still excludes node_modules", async () => {
		const cwd = process.cwd();
		try {
			process.chdir(tmpDir);
			await Bun.write(join(tmpDir, "main.ts"), "const a = 1;");
			mkdirSync(join(tmpDir, "node_modules", "lib"), { recursive: true });
			await Bun.write(join(tmpDir, "node_modules", "lib", "mod.ts"), "export {}");

			const service = new FileService();
			const files = await service.resolveFiles(["."]);

			expect(files).toEqual(["main.ts"]);
		} finally {
			process.chdir(cwd);
		}
	});

	test("user-supplied ignore patterns exclude matching files", async () => {
		await Bun.write(join(tmpDir, "keep.ts"), "export const k = 1;");
		await Bun.write(join(tmpDir, "skip.ts"), "export const s = 2;");

		const service = new FileService({ ignore: ["**/skip.ts"] });
		const files = await service.resolveFiles([tmpDir]);

		expect(files).toEqual([toPosixPath(join(tmpDir, "keep.ts"))]);
	});
});

describe("FileService.writeFile", () => {
	test("rejects when writing to node_modules", () => {
		const service = new FileService();
		const target = join(tmpDir, "node_modules", "bad.ts");

		// Bun types toThrow as void (not Promise); runner still tracks the rejection.
		expect(service.writeFile(target, "bad")).rejects.toThrow("protected path");
	});

	test("rejects when writing to .git", () => {
		const service = new FileService();
		const target = join(tmpDir, ".git", "config");

		expect(service.writeFile(target, "bad")).rejects.toThrow("protected path");
	});
});
