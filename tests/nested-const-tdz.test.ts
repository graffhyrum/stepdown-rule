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

const viaLetArrow = `export function run() {
	let c = () => 1;
	const x = () => c();
	return x();
}
`;

const viaFunctionExpression = `export function run() {
	const f = function () {
		return 1;
	};
	const x = () => f();
	return x();
}
`;

const constCycle = `export function run() {
	const a = (): number => b();
	const b = (): number => a();
	return a;
}
`;

const mixedChain = `export function run() {
	const c = () => 1;
	function mid() {
		return c();
	}
	const x = () => mid();
	return x();
}
`;

const multiDeclarator = `export function run() {
	const a = () => 1, b = () => 2;
	return b();
}
`;

test.each([
	["let arrow reached via another helper", viaLetArrow, "c", "return x()"],
	["function expression reached via another helper", viaFunctionExpression, "f", "return x()"],
	["const cycle reached from logic", constCycle, "a", "return a"],
	["const behind a hoisted function in a mixed chain", mixedChain, "c", "return x()"],
	["multi-declarator statement used by logic", multiDeclarator, "a", "return b()"],
])("%s stays pinned before the return", (_label, code, name, ret) => {
	const flagged = analyzeCode(code).nestedFunctionViolations.map((v) => v.nested.name);
	expect(flagged).not.toContain(name);
	const { fixedContent } = fixCode(code, defaultConfig);
	expect(fixedContent.search(new RegExp(`(const|let) ${name}\b`))).toBeLessThan(
		fixedContent.indexOf(ret),
	);
});

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
		// Imports the fixed output to prove it runs without a TDZ error.
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
