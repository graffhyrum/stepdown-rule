import { describe, expect, it } from "bun:test";
import packageJson from "../package.json";

describe("package.json bin", () => {
	it("every bin target is tracked in git", () => {
		const bin = packageJson.bin;
		expect(bin).toBeDefined();

		for (const [name, target] of Object.entries(bin)) {
			const path = target.replace(/^\.\//, "");
			const result = Bun.spawnSync(["git", "ls-files", "--error-unmatch", path], {
				stdout: "pipe",
				stderr: "pipe",
			});
			expect(result.exitCode, `bin "${name}" target "${path}" is not in git`).toBe(0);
		}
	});
});
