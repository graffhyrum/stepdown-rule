import { beforeAll, expect, test } from "bun:test";
import ts from "typescript";
import { fixFileWithRules, fixFiles, fixParsedFile } from "../src/fixer";
import { registerDefaultRules } from "../src/register-default-rules";
import type { RuleContext, Violation, ViolationRule } from "../src/rule-context";
import { clear } from "../src/registry";
import { InMemoryFileService } from "../src/services/InMemoryFileService";
import { analyzeCode, fixCode, fixConfig, withTempFile } from "./helpers";

beforeAll(() => {
	clear();
	registerDefaultRules();
});

// --- Core fix behavior (in-memory) ---

test("reorders functions to fix violations", () => {
	const code = `function helper() { return "helper"; }
// padding
// 1
// 2
// 3
// 4
// 5
// 6
// 7
// 8
// 9
// 10
function main() { return helper(); }`;
	const { result, fixedContent } = fixCode(code);
	expect(result.fixed).toBe(true);
	expect(result.reordered).toBeGreaterThan(0);
	expect(result.errors).toHaveLength(0);
	expect(fixedContent.indexOf("function main")).toBeLessThan(
		fixedContent.indexOf("function helper"),
	);
});

test("fixes stepdown when callee-only helper is defined first (multiple callers)", () => {
	const code = `function sharedHelper() { return "ok"; }
function callerA() { return sharedHelper(); }
function callerB() { return sharedHelper(); }
function callerC() { return sharedHelper(); }`;
	const { result, fixedContent } = fixCode(code);
	expect(result.fixed, "fixer should fix stepdown violations").toBe(true);
	expect(result.errors).toHaveLength(0);
	expect(fixedContent).toContain("function sharedHelper()");
	expect(fixedContent).toContain("function callerA()");
	expect(fixedContent).toContain("function callerB()");
	expect(fixedContent).toContain("function callerC()");
	const idxHelper = fixedContent.indexOf("function sharedHelper()");
	const idxA = fixedContent.indexOf("function callerA()");
	const idxB = fixedContent.indexOf("function callerB()");
	const idxC = fixedContent.indexOf("function callerC()");
	expect(idxA).toBeLessThan(idxHelper);
	expect(idxB).toBeLessThan(idxHelper);
	expect(idxC).toBeLessThan(idxHelper);
});

test("does not modify files with no violations", () => {
	const code = `function main() { return helper(); }
function helper() { return "helper"; }`;
	const { result, fixedContent } = fixCode(code);
	expect(result.fixed).toBe(false);
	expect(result.reordered).toBe(0);
	expect(fixedContent).toBe(code);
});

test("preserves imports and exports", () => {
	const code = `import { something } from "somewhere";
function helper() { return something(); }
function main() { return helper(); }
export { main };`;
	const { result, fixedContent } = fixCode(code);
	expect(result.fixed).toBe(true);
	expect(fixedContent.indexOf("import")).toBeLessThan(fixedContent.indexOf("function"));
	expect(fixedContent.indexOf("export")).toBeGreaterThan(fixedContent.indexOf("function"));
});

test("handles arrow functions", () => {
	const code = `const helper = () => "helper";
const main = () => helper();`;
	const { result } = fixCode(code);
	expect(result.fixed).toBe(true);
	expect(result.errors).toHaveLength(0);
});

test("handles mixed declarations and arrows", () => {
	const code = `const arrowHelper = () => "arrow";
function declHelper() { return "decl"; }
function main() { return arrowHelper() + declHelper(); }`;
	const { result } = fixCode(code);
	expect(result.fixed).toBe(true);
	expect(result.errors).toHaveLength(0);
});

test("handles complex dependency chains", () => {
	const code = `function level3() { return "base"; }
function level2a() { level3(); }
function level2b() { level3(); }
function level1() { level2a(); level2b(); }`;
	const { result, fixedContent } = fixCode(code);
	expect(result.fixed).toBe(true);
	const i1 = fixedContent.indexOf("function level1");
	const i2a = fixedContent.indexOf("function level2a");
	const i2b = fixedContent.indexOf("function level2b");
	const i3 = fixedContent.indexOf("function level3");
	expect(i1).toBeLessThan(i2a);
	expect(i1).toBeLessThan(i2b);
	expect(i2a).toBeLessThan(i3);
	expect(i2b).toBeLessThan(i3);
});

// --- Bead fixtures (1e0, 27g) ---

test("1e0: fixes factory with method calling helper", async () => {
	const content = await Bun.file("fixtures/test-factory-method-calls.ts").text();
	const { result, fixedContent, after } = fixCode(content);
	expect(result.fixed).toBe(true);
	expect(result.errors).toHaveLength(0);
	expect(after.violations.length).toBe(0);
	expect(analyzeCode(fixedContent).violations.length).toBe(0);
});

test("27g: fixes arrow const chain", async () => {
	const content = await Bun.file("fixtures/test-arrow-chain.ts").text();
	const { result, after } = fixCode(content);
	expect(result.fixed).toBe(true);
	expect(after.violations.length).toBe(0);
});

test("27g: order-repo style - caller above callee", async () => {
	const content = await Bun.file("fixtures/test-order-repo-27g.ts").text();
	const { result, fixedContent } = fixCode(content);
	expect(result.fixed).toBe(true);
	const createIdx = fixedContent.indexOf("function createSurrealOrderRepository");
	const mapIdx = fixedContent.indexOf("const mapValidOrders");
	const parseIdx = fixedContent.indexOf("const parseSingleOrder");
	const validateIdx = fixedContent.indexOf("function validateAndParseOrder");
	expect(createIdx).toBeLessThan(mapIdx);
	expect(createIdx).toBeLessThan(parseIdx);
	expect(mapIdx).toBeLessThan(validateIdx);
	expect(parseIdx).toBeLessThan(validateIdx);
});

// --- Error / edge cases ---

test("returns empty for non-matching patterns", async () => {
	const results = await fixFiles(["non-existent-*.ts"], fixConfig);
	expect(results).toHaveLength(0);
});

test("handles files with no functions", () => {
	const { result } = fixCode("const x = 42;\nconsole.log(x);");
	expect(result.fixed).toBe(false);
	expect(result.reordered).toBe(0);
});

test("handles circular dependencies without crashing", () => {
	const code = `function a() { b(); }
function b() { c(); }
function c() { a(); }`;
	const { result } = fixCode(code);
	expect(result).toBeDefined();
});

test("handles files with only imports and exports", () => {
	const { result } = fixCode(`import { x } from "x";\nexport { x };`);
	expect(result.fixed).toBe(false);
});

test("reorders top-level when nested callback also present (describe pattern)", () => {
	const code = `function topHelper() { return "h"; }
function topMain() { return topHelper(); }
const run = (name: string, fn: () => void) => fn();
run("suite", () => {
  function helper() { return 42; }
  function caller() { return helper(); }
});`;
	const { result, fixedContent } = fixCode(code);
	expect(result.fixed).toBe(true);
	expect(fixedContent.indexOf("function topMain")).toBeLessThan(
		fixedContent.indexOf("function topHelper"),
	);
});

test("reorders exported function declarations", () => {
	const code = `export function helper() { return "h"; }
export function main() { return helper(); }`;
	const { result, fixedContent } = fixCode(code);
	expect(result.fixed).toBe(true);
	expect(fixedContent.indexOf("function main")).toBeLessThan(
		fixedContent.indexOf("function helper"),
	);
});

test("reorders const arrow function chains", () => {
	const code = `const leaf = () => "leaf";
const middle = () => leaf();
const top = () => middle();`;
	const { result, fixedContent } = fixCode(code);
	expect(result.fixed).toBe(true);
	expect(fixedContent.indexOf("top")).toBeLessThan(fixedContent.indexOf("middle"));
	expect(fixedContent.indexOf("middle")).toBeLessThan(fixedContent.indexOf("leaf"));
});

test("handles syntax errors gracefully", () => {
	const { result } = fixCode("function broken() {\n  // no close");
	expect(result).toBeDefined();
});

test("non-function const stays before functions after fix (no TDZ)", () => {
	const code = `const CONFIG = { timeout: 5000 };
function helper() { return CONFIG.timeout; }
function main() { return helper(); }`;
	const { result, fixedContent } = fixCode(code);
	expect(result.errors).toHaveLength(0);
	const configIdx = fixedContent.indexOf("const CONFIG");
	const mainIdx = fixedContent.indexOf("function main");
	const helperIdx = fixedContent.indexOf("function helper");
	expect(configIdx).toBeLessThan(mainIdx);
	expect(configIdx).toBeLessThan(helperIdx);
});

// --- Disk integration: prove fixFiles + FileService read/write ---

test("integration: fixFiles writes reordered content to disk", async () => {
	await withTempFile(
		`function helper() { return "helper"; }
function main() { return helper(); }`,
		async (file) => {
			const [result] = await fixFiles([file], fixConfig);
			expect(result?.fixed).toBe(true);
			const content = await Bun.file(file).text();
			expect(content.indexOf("function main")).toBeLessThan(content.indexOf("function helper"));
		},
	);
});

test("integration: fixFiles leaves compliant file unchanged on disk", async () => {
	await withTempFile(
		`function main() { return helper(); }
function helper() { return "helper"; }`,
		async (file) => {
			const original = await Bun.file(file).text();
			const [result] = await fixFiles([file], fixConfig);
			expect(result?.fixed).toBe(false);
			expect(await Bun.file(file).text()).toBe(original);
		},
	);
});

test("integration: fixFiles preserves imports/exports on disk", async () => {
	await withTempFile(
		`import { something } from "somewhere";
function helper() { return something(); }
function main() { return helper(); }
export { main };`,
		async (file) => {
			const [result] = await fixFiles([file], fixConfig);
			expect(result?.fixed).toBe(true);
			const content = await Bun.file(file).text();
			expect(content.indexOf("import")).toBeLessThan(content.indexOf("function"));
			expect(content.indexOf("export")).toBeGreaterThan(content.indexOf("function"));
		},
	);
});

// --- Print-to-print change detection (stepdown-5x2.10) ---

const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });

function printRaw(content: string, filePath = "test.ts"): string {
	return printer.printFile(ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true));
}

test("print-to-print: identity print with violation gate off is not a change", () => {
	const raw = `function main(){return helper();}
function helper(){return 1;}`;
	expect(raw !== printRaw(raw), "fixture must differ from printer output").toBe(true);

	const identityPrintRule: ViolationRule = {
		id: "identity-print",
		analyze(): Violation[] {
			// Force fix path; shape unused by this rule's fix.
			return [{} as Violation];
		},
		fix(ctx: RuleContext): string {
			return printer.printFile(ctx.parsedFile.sourceFile);
		},
	};

	const service = new InMemoryFileService();
	const result = fixFileWithRules({
		filePath: "test.ts",
		originalContent: raw,
		enabledRules: [identityPrintRule],
		service,
	});
	expect(result.fixed).toBe(false);
	expect(result.reordered).toBe(0);
});

test("print-to-print: real reorder still sets fixed", () => {
	const code = `function helper() { return "helper"; }
function main() { return helper(); }`;
	const { result, fixedContent } = fixCode(code);
	expect(result.fixed).toBe(true);
	expect(fixedContent.indexOf("function main")).toBeLessThan(
		fixedContent.indexOf("function helper"),
	);
});

test("print-to-print: fixParsedFile no-op when print(original) matches print(transformed)", () => {
	const code = `function main() { return helper(); }
function helper() { return "helper"; }`;
	const analysis = analyzeCode(code);
	expect(analysis.violations).toHaveLength(0);
	const result = fixParsedFile({
		content: code,
		filePath: "test.ts",
		analysisResult: analysis,
	});
	expect(result.fixed).toBe(false);
});

test("integration: print-to-print no-write on compliant fixture", async () => {
	const original = await Bun.file("fixtures/test-correct.ts").text();
	await withTempFile(original, async (file) => {
		const [result] = await fixFiles([file], fixConfig);
		expect(result?.fixed).toBe(false);
		expect(await Bun.file(file).text()).toBe(original);
	});
});

test("integration: print-to-print writes real reorder fixture", async () => {
	const original = await Bun.file("fixtures/test-violations.ts").text();
	await withTempFile(original, async (file) => {
		const [result] = await fixFiles([file], fixConfig);
		expect(result?.fixed).toBe(true);
		const after = await Bun.file(file).text();
		expect(after).not.toBe(original);
	});
});

test("integration: dry-run detects reorder but does not write", async () => {
	const original = await Bun.file("fixtures/test-violations.ts").text();
	await withTempFile(original, async (file) => {
		const [result] = await fixFiles([file], fixConfig, undefined, { dryRun: true });
		expect(result?.fixed).toBe(true);
		expect(await Bun.file(file).text()).toBe(original);
	});
});
