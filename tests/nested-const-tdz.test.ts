import { beforeAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registerDefaultRules } from "../src/register-default-rules";
import { clear } from "../src/registry";
import { analyzeCode, defaultConfig, fixCode } from "./helpers";

beforeAll(() => {
	clear();
	registerDefaultRules();
});

const authRepro = `export function createAuth(keys: string[]) {
	const extractApiKey = (req: { header: string }) => req.header.replace("Bearer ", "");
	const validateApiKey = (key: string) => keys.includes(key);
	const apiKeyAuth = (req: { header: string }) => validateApiKey(extractApiKey(req));
	return { apiKeyAuth };
}
`;

const viaHoistedDeclaration = `export function run() {
	const b = () => 1;
	function a() {
		return b();
	}
	return a();
}
`;

const viaNestedFunctionOnly = `export function run() {
	function low() {
		return 1;
	}
	function mid() {
		return low();
	}
	const value = mid();
	return value;
}
`;

const unreferencedConst = `export function run() {
	const unused = () => 1;
	return 2;
}
`;

test("const helper reached only through another nested helper is not flagged", () => {
	expect(analyzeCode(authRepro).nestedFunctionViolations).toHaveLength(0);
});

test("fix keeps const helpers before return and the fixed code still runs", async () => {
	const { fixedContent } = fixCode(authRepro, defaultConfig);
	const returnAt = fixedContent.indexOf("return { apiKeyAuth }");
	expect(fixedContent.indexOf("const extractApiKey")).toBeLessThan(returnAt);
	expect(fixedContent.indexOf("const validateApiKey")).toBeLessThan(returnAt);
	const dir = mkdtempSync(join(tmpdir(), "const-tdz-"));
	try {
		const file = join(dir, "auth.ts");
		writeFileSync(file, fixedContent);
		const mod = await import(file);
		expect(mod.createAuth(["k"]).apiKeyAuth({ header: "Bearer k" })).toBe(true);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("const helper reached through a hoisted function declaration stays pinned", () => {
	expect(analyzeCode(viaHoistedDeclaration).nestedFunctionViolations).toHaveLength(0);
	const { fixedContent } = fixCode(viaHoistedDeclaration, defaultConfig);
	expect(fixedContent.indexOf("const b")).toBeLessThan(fixedContent.indexOf("return a()"));
});

test("function declaration reached only transitively may still move below logic", () => {
	const flagged = analyzeCode(viaNestedFunctionOnly).nestedFunctionViolations.map(
		(v) => v.nested.name,
	);
	expect(flagged).toContain("low");
	const { fixedContent } = fixCode(viaNestedFunctionOnly, defaultConfig);
	expect(fixedContent.indexOf("function low")).toBeGreaterThan(fixedContent.indexOf("return value"));
});

test("unreferenced const arrow helper before logic is still flagged and moved", () => {
	expect(analyzeCode(unreferencedConst).nestedFunctionViolations.map((v) => v.nested.name)).toEqual([
		"unused",
	]);
	const { fixedContent } = fixCode(unreferencedConst, defaultConfig);
	expect(fixedContent.indexOf("const unused")).toBeGreaterThan(fixedContent.indexOf("return 2"));
});
