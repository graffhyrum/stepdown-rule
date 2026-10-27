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
	const declAt = positionOf(fixedContent, new RegExp(`(?:const|let) ${name}\\b`));
	expect(declAt).toBeLessThan(positionOf(fixedContent, ret));
});

test("multi-declarator statement is not moved by the fix", () => {
	const { fixedContent } = fixCode(multiDeclarator, defaultConfig);
	const stmtAt = positionOf(fixedContent, "const a = () => 1, b = () => 2;");
	expect(stmtAt).toBeLessThan(positionOf(fixedContent, "return b()"));
});

test("const helper reached only through another nested helper is not flagged", () => {
	expect(analyzeCode(authRepro).nestedFunctionViolations).toHaveLength(0);
});

test("fix keeps const helpers before return and the fixed code still runs", async () => {
	const { fixedContent } = fixCode(authRepro, defaultConfig);
	const returnAt = positionOf(fixedContent, "return { apiKeyAuth }");
	expect(positionOf(fixedContent, "const extractApiKey")).toBeLessThan(returnAt);
	expect(positionOf(fixedContent, "const validateApiKey")).toBeLessThan(returnAt);
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
	expect(positionOf(fixedContent, "const b")).toBeLessThan(positionOf(fixedContent, "return a()"));
});

test("function declaration reached only transitively may still move below logic", () => {
	const flagged = analyzeCode(viaNestedFunctionOnly).nestedFunctionViolations.map(
		(v) => v.nested.name,
	);
	expect(flagged).toContain("low");
	const { fixedContent } = fixCode(viaNestedFunctionOnly, defaultConfig);
	expect(positionOf(fixedContent, "function low")).toBeGreaterThan(
		positionOf(fixedContent, "return value"),
	);
});

test("unreferenced const arrow helper before logic is still flagged and moved", () => {
	expect(analyzeCode(unreferencedConst).nestedFunctionViolations.map((v) => v.nested.name)).toEqual([
		"unused",
	]);
	const { fixedContent } = fixCode(unreferencedConst, defaultConfig);
	expect(positionOf(fixedContent, "const unused")).toBeGreaterThan(
		positionOf(fixedContent, "return 2"),
	);
});

const viaAlias = `export function outer() {
	const helper = () => 1;
	const caller = () => {
		const fn = helper;
		return fn();
	};
	return caller();
}
`;

const viaArgument = `export function outer() {
	const helper = (n: number) => n + 1;
	const caller = () => [1].map(helper)[0];
	return caller();
}
`;

const viaObjectLiteral = `export function outer() {
	const helper = () => 1;
	const caller = () => {
		const bag = { helper };
		return bag.helper();
	};
	return caller();
}
`;

const viaArrayLiteral = `export function outer() {
	const helper = () => 1;
	const caller = () => {
		const list = [helper];
		return list[0]();
	};
	return caller();
}
`;

const declarationViaAlias = `export function outer() {
	function helper() {
		return 1;
	}
	const caller = () => {
		const fn = helper;
		return fn();
	};
	return caller();
}
`;

test.each([
	["alias assignment", viaAlias, 1],
	["argument passing", viaArgument, 2],
	["object literal", viaObjectLiteral, 1],
	["array literal", viaArrayLiteral, 1],
])("const helper reached by %s is pinned and the fixed code runs", async (_label, code, expected) => {
	expect(analyzeCode(code).nestedFunctionViolations.map((v) => v.nested.name)).not.toContain(
		"helper",
	);
	const { fixedContent } = fixCode(code, defaultConfig);
	expect(positionOf(fixedContent, "const helper")).toBeLessThan(
		positionOf(fixedContent, "return caller()"),
	);
	expect(await runOuter(fixedContent)).toBe(expected);
});

test("function declaration reached only by alias stays movable and the fixed code runs", async () => {
	const flagged = analyzeCode(declarationViaAlias).nestedFunctionViolations.map(
		(v) => v.nested.name,
	);
	expect(flagged).toContain("helper");
	const { fixedContent } = fixCode(declarationViaAlias, defaultConfig);
	expect(positionOf(fixedContent, "function helper")).toBeGreaterThan(
		positionOf(fixedContent, "return caller()"),
	);
	expect(await runOuter(fixedContent)).toBe(1);
});

// Imports the fixed output so a TDZ ReferenceError fails the test.
async function runOuter(content: string): Promise<number> {
	const dir = mkdtempSync(join(tmpdir(), "const-tdz-"));
	try {
		const file = join(dir, "fixed.ts");
		writeFileSync(file, content);
		const mod = await import(file);
		return mod.outer();
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

// Fails on a missing match so a -1 index can never satisfy an ordering assertion.
function positionOf(content: string, pattern: string | RegExp): number {
	const at = typeof pattern === "string" ? content.indexOf(pattern) : content.search(pattern);
	expect(at).toBeGreaterThanOrEqual(0);
	return at;
}
