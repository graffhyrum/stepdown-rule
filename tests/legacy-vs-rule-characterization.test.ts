import { describe, expect, test } from "bun:test";
import { analyzeParsedFile, analyzeWithRules } from "../src/analyzer";
// Intentionally uses deprecated legacy fixer for characterization vs rules path.
// noinspection JSDeprecatedSymbols
import { fixFileWithRules, fixParsedFile } from "../src/fixer";
import { registerDefaultRules } from "../src/register-default-rules";
import { createRegistry } from "../src/registry";
import { FileService } from "../src/services/FileService";

const service = new FileService();
const registry = createRegistry();
registerDefaultRules(registry);
const enabledRules = registry.getEnabled();

async function loadFixture(name: string): Promise<string> {
	return Bun.file(`fixtures/${name}`).text();
}

function legacyFix(content: string, filePath = "test.ts"): string {
	const analysis = analyzeParsedFile(service.parseContent(content, filePath));
	// noinspection JSDeprecatedSymbols
	return fixParsedFile({
		content,
		filePath,
		analysisResult: analysis,
	}).fixedContent;
}

function ruleFix(content: string, filePath = "test.ts"): string {
	return fixFileWithRules({
		filePath,
		originalContent: content,
		enabledRules,
		service,
	}).fixedContent;
}

function circularSetsEqual(a: string[][], b: string[][]): boolean {
	const normalize = (cycles: string[][]) =>
		cycles
			.map((cycle) => [...cycle].sort().join(">"))
			.sort()
			.join("|");
	return normalize(a) === normalize(b);
}

describe("characterization: legacy vs rule fix output", () => {
	const fixtures: { name: string; file: string }[] = [
		{ name: "top-level reorder", file: "test-violations.ts" },
		{ name: "nested callback", file: "test-nested-violation.ts" },
		{ name: "nested arrow", file: "test-nested-arrow.ts" },
		{ name: "circular deps", file: "test-circular.ts" },
		{ name: "factory arrow", file: "test-factory-method-calls.ts" },
		{ name: "exported const chain", file: "test-arrow-chain.ts" },
		{ name: "no-op idempotent", file: "test-correct.ts" },
	];

	for (const { name, file } of fixtures) {
		test(`${name} (${file}): legacy and rule fix byte-identical`, async () => {
			const content = await loadFixture(file);
			expect(ruleFix(content, file)).toBe(legacyFix(content, file));
		});
	}

	test("exported function + helper: legacy and rule fix byte-identical", () => {
		const content = `function helper(): string { return "h"; }

export function main(): string { return helper(); }
`;
		expect(ruleFix(content)).toBe(legacyFix(content));
	});

	test("exported const arrow: legacy and rule fix byte-identical", () => {
		const content = `export const helper = (): string => "h";

export const main = (): string => helper();
`;
		expect(ruleFix(content)).toBe(legacyFix(content));
	});
});

describe("characterization: analyzeParsedFile vs analyzeWithRules", () => {
	test("circular fixture: violation counts and circular sets match", async () => {
		const content = await loadFixture("test-circular.ts");
		const parsed = service.parseContent(content, "test-circular.ts");
		const legacy = analyzeParsedFile(parsed);
		const withRules = analyzeWithRules(parsed, enabledRules);

		expect(withRules.violations.length).toBe(legacy.violations.length);
		expect(withRules.nestedFunctionViolations.length).toBe(
			legacy.nestedFunctionViolations.length,
		);
		expect(withRules.circularDependencies.length).toBe(legacy.circularDependencies.length);
		expect(circularSetsEqual(withRules.circularDependencies, legacy.circularDependencies)).toBe(
			true,
		);
	});

	test("top-level + nested fixtures: violation counts match", async () => {
		for (const file of ["test-violations.ts", "test-nested-violation.ts", "test-correct.ts"]) {
			const content = await loadFixture(file);
			const parsed = service.parseContent(content, file);
			const legacy = analyzeParsedFile(parsed);
			const withRules = analyzeWithRules(parsed, enabledRules);
			expect(withRules.violations.length, `${file} stepdown`).toBe(legacy.violations.length);
			expect(withRules.nestedFunctionViolations.length, `${file} nested`).toBe(
				legacy.nestedFunctionViolations.length,
			);
			expect(
				circularSetsEqual(withRules.circularDependencies, legacy.circularDependencies),
				`${file} circular`,
			).toBe(true);
		}
	});
});
