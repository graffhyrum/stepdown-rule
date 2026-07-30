import { emitCliError } from "./cli-errors";
import { buildConfigFromCliSafe, runAnalyze, runFix } from "./cli-runners";
import { ExitInternal, ExitUsage } from "./exit-codes";
import { createReporter, resolveFormat, type Reporter } from "./reporter";
import { FileService } from "./services/FileService";
import type { IFileService } from "./services/types";
import type { Config } from "./types";

const subcommandNames = ["fix", "analyze", "agents"];

export async function runHumanAnalyze(
	patterns: string[],
	options: {
		ignore?: string[];
		json?: boolean;
		format?: string;
		config?: string;
		rules?: string;
		verbose?: boolean;
		includeGraph?: boolean;
	},
	reporter: Reporter = createReporter(resolveFormat(options)),
): Promise<void> {
	const misplaced = patterns.find((p) => subcommandNames.includes(p));
	if (misplaced) {
		console.error(`Error: "${misplaced}" looks like a subcommand, not a file pattern.`);
		console.error(`Usage: stepdown-rule ${misplaced} <patterns...>`);
		process.exitCode = ExitUsage;
		return;
	}
	const built = await buildConfigFromCliSafe(options);
	if ("error" in built) {
		emitCliError(built.error);
		process.exitCode = reporter.reportEarlyFailure("analyze", [built.error], {
			command: agentsCommand(reporter, "analyze"),
		});
		return;
	}
	const config = built.config;
	const fileService = new FileService({ ignore: config.ignore });
	const resolved = await resolveFilesOrReport(fileService, patterns, reporter);
	if (!resolved) return;
	const results = await runAnalyze(patterns, config, fileService, resolved.files);
	const verbose = options.verbose || reporter.format === "json";
	process.exitCode = reporter.reportAnalyze(results, {
		verbose,
		includeGraph: options.includeGraph,
		command: agentsCommand(reporter, "analyze"),
	});
}

export async function runHumanFix(
	patterns: string[],
	options: {
		ignore?: string[];
		json?: boolean;
		format?: string;
		config?: string;
		rules?: string;
		dryRun?: boolean;
		includeContent?: boolean;
	},
	reporter: Reporter = createReporter(resolveFormat(options)),
): Promise<void> {
	const misplaced = patterns.find((p) => subcommandNames.includes(p));
	if (misplaced) {
		console.error(`Error: "${misplaced}" looks like a subcommand, not a file pattern.`);
		console.error(`Usage: stepdown-rule ${misplaced} <patterns...>`);
		process.exitCode = ExitUsage;
		return;
	}
	const built = await buildConfigFromCliSafe(options);
	if ("error" in built) {
		emitCliError(built.error);
		process.exitCode = reporter.reportEarlyFailure("fix", [built.error], {
			command: agentsCommand(reporter, "fix"),
		});
		return;
	}
	const config: Config = { ...built.config, fix: true };
	const fileService = new FileService({ ignore: config.ignore });
	const resolved = await resolveFilesOrReport(fileService, patterns, reporter, "fix");
	if (!resolved) return;
	const fixResults = await runFix(patterns, config, fileService, {
		resolvedFiles: resolved.files,
		dryRun: options.dryRun,
	});
	process.exitCode = reporter.reportFix(fixResults, {
		dryRun: options.dryRun,
		includeContent: options.includeContent,
		command: agentsCommand(reporter, "fix"),
	});
}

export function handleUnexpectedError(
	error: unknown,
	jsonOrReporter: boolean | undefined | Reporter,
): void {
	const message = error instanceof Error ? error.message : String(error);
	const payload = {
		code: "INTERNAL_ERROR" as const,
		message,
		hint: "Report this issue with the command and file patterns used.",
	};
	emitCliError(payload);
	const reporter =
		typeof jsonOrReporter === "object" && jsonOrReporter !== null
			? jsonOrReporter
			: createReporter(jsonOrReporter ? "json" : "human");
	process.exitCode = reporter.reportEarlyFailure("analyze", [payload], {
		command: agentsCommand(reporter, "analyze"),
	});
	if (process.exitCode === undefined) {
		process.exitCode = ExitInternal;
	}
}

async function resolveFilesOrReport(
	fileService: IFileService,
	patterns: string[],
	reporter: Reporter,
	kind: "analyze" | "fix" = "analyze",
): Promise<{ files: string[] } | null> {
	const files = await fileService.resolveFiles(patterns);
	if (files.length === 0) {
		const payload = {
			code: "NO_FILES" as const,
			message: `No files matched: ${patterns.join(", ")}`,
			hint: "Quote globs for the shell, e.g. 'src/**/*.ts'.",
		};
		emitCliError(payload);
		process.exitCode = reporter.reportEarlyFailure(kind, [payload], {
			command: agentsCommand(reporter, kind),
		});
		return null;
	}
	return { files };
}

function agentsCommand(reporter: Reporter, kind: "analyze" | "fix"): string {
	return reporter.format === "agents" ? `agents/${kind}` : kind;
}
