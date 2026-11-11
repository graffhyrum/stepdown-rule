import { statSync } from "node:fs";
import { resolve } from "node:path";
import { loadConfig } from "../config/loader";
import { FileService } from "../services/FileService";
import type { Finding } from "./types";
export interface DetectContext {
	cwd: string;
	patterns: string[];
	only?: string[];
	quick: boolean;
	online: boolean;
}
// re-export RUNS_DIR path string
const RUNS_DIR = ".doctor/runs";
export async function detectAll(ctx: DetectContext): Promise<Finding[]> {
	const findings: Finding[] = [];
	// 1. node_modules
	let nodeModulesExists = false;
	try {
		nodeModulesExists = statSync(resolve(ctx.cwd, "node_modules")).isDirectory();
	} catch {
		nodeModulesExists = false;
	}
	if (!nodeModulesExists) {
		findings.push({
			id: makeId("node_modules_missing", findings.length),
			fmId: "node_modules_missing",
			severity: "high",
			subsystem: "dependencies",
			title: "node_modules directory is missing",
			detail: "Dependencies are not installed; the CLI cannot run.",
			fixable: false,
			fixHint: "Run 'bun install' (or 'npm install') in the project root.",
		});
	}
	// 2. build artifact
	if (!(await Bun.file(resolve(ctx.cwd, "dist", "cli.js")).exists())) {
		findings.push({
			id: makeId("build_artifact_missing", findings.length),
			fmId: "build_artifact_missing",
			severity: "medium",
			subsystem: "build",
			title: "dist/cli.js is missing",
			detail: "The compiled CLI entry point is absent; 'bun run build' has not been run.",
			fixable: false,
			fixHint: "Run 'bun run build'.",
		});
	}
	// 3. config validity
	let configError: string | null = null;
	try {
		await loadConfig(".stepdownrc.json");
	} catch (e) {
		configError = e instanceof Error ? e.message : String(e);
	}
	// only report if file exists but invalid
	const configPath = resolve(ctx.cwd, ".stepdownrc.json");
	if ((await Bun.file(configPath).exists()) && configError) {
		findings.push({
			id: makeId("config_invalid", findings.length),
			fmId: "config_invalid",
			severity: "high",
			subsystem: "config",
			title: "Invalid .stepdownrc.json",
			detail: configError,
			evidence: configPath,
			fixable: false,
			fixHint: "Fix the JSON or schema errors in .stepdownrc.json.",
		});
	}
	// 4. gitignore .doctor
	const gitignorePath = resolve(ctx.cwd, ".gitignore");
	let gitignoreContent = "";
	if (await Bun.file(gitignorePath).exists()) {
		gitignoreContent = await Bun.file(gitignorePath).text();
	}
	if (!gitignoreContent.includes(".doctor/")) {
		findings.push({
			id: makeId("gitignore_doctor_missing", findings.length),
			fmId: "gitignore_doctor_missing",
			severity: "medium",
			subsystem: "vcs",
			title: ".doctor/ is not gitignored",
			detail: "Per-run doctor artifacts would be committed unless .doctor/ is ignored.",
			evidence: gitignorePath,
			fixable: true,
			fixHint: "Append '.doctor/' to .gitignore.",
		});
	}
	// 5. no files matched (default patterns)
	if (!ctx.quick) {
		try {
			const fs = new FileService();
			const files = await fs.resolveFiles(ctx.patterns);
			if (files.length === 0) {
				findings.push({
					id: makeId("no_files_matched", findings.length),
					fmId: "no_files_matched",
					severity: "medium",
					subsystem: "files",
					title: "No files matched the given patterns",
					detail: `Patterns: ${ctx.patterns.join(", ")}`,
					fixable: false,
					fixHint: "Quote globs for the shell, e.g. 'src/**/*.ts'.",
				});
			}
		} catch (e) {
			findings.push({
				id: makeId("file_resolution_error", findings.length),
				fmId: "file_resolution_error",
				severity: "high",
				subsystem: "files",
				title: "File resolution failed",
				detail: e instanceof Error ? e.message : String(e),
				fixable: false,
			});
		}
	}
	// 6. ts parse errors in input files
	if (!ctx.quick) {
		try {
			const fs = new FileService();
			const files = await fs.resolveFiles(ctx.patterns);
			for (const f of files.slice(0, 50)) {
				try {
					const parsed = await fs.parseFile(f);
					// basic check: sourceFile has parseDiagnostics? TS SourceFile doesn't expose easily; skip deep.
					void parsed;
				} catch (e) {
					findings.push({
						id: makeId("parse_error", findings.length),
						fmId: "parse_error",
						severity: "high",
						subsystem: "files",
						title: `Failed to parse ${f}`,
						detail: e instanceof Error ? e.message : String(e),
						evidence: f,
						fixable: false,
					});
				}
			}
		} catch {
			// already reported
		}
	}
	// 7. stale runs
	let staleRunsDirExists = false;
	try {
		staleRunsDirExists = statSync(resolve(ctx.cwd, RUNS_DIR)).isDirectory();
	} catch {
		staleRunsDirExists = false;
	}
	if (staleRunsDirExists) {
		const { readdirSync } = await import("node:fs");
		const runs = readdirSync(resolve(ctx.cwd, RUNS_DIR));
		if (runs.length > 20) {
			findings.push({
				id: makeId("stale_runs", findings.length),
				fmId: "stale_runs",
				severity: "low",
				subsystem: "doctor",
				title: "Many stale doctor runs accumulate",
				detail: `${runs.length} runs in .doctor/runs/.`,
				fixable: true,
				fixHint: "Run 'stepdown-rule doctor gc --before <date> --yes'.",
			});
		}
	}
	// apply --only filter
	if (ctx.only && ctx.only.length > 0) {
		const only = ctx.only;
		return findings.filter((f) => only.includes(f.subsystem) || only.includes(f.fmId));
	}
	return findings;
}
function makeId(fmId: string, idx: number): string {
	return `${fmId}-${idx}`;
}
