import { emitCliError } from "./cli-errors";
import { prepareAnalyze, prepareFix, runAnalyze, runFix } from "./cli-runners";
import { ExitInternal, ExitUsage } from "./exit-codes";
import { createReporter, resolveFormat, type Reporter } from "./reporter";

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
	const preflight = await prepareAnalyze(patterns, options);
	if (!preflight.ok) {
		for (const error of preflight.errors) emitCliError(error);
		process.exitCode = reporter.reportEarlyFailure("analyze", preflight.errors, {
			command: agentsCommand(reporter, "analyze"),
		});
		return;
	}
	const { config, fileService, files } = preflight;
	const results = await runAnalyze(patterns, config, fileService, files);
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
	const preflight = await prepareFix(patterns, options);
	if (!preflight.ok) {
		for (const error of preflight.errors) emitCliError(error);
		process.exitCode = reporter.reportEarlyFailure("fix", preflight.errors, {
			command: agentsCommand(reporter, "fix"),
		});
		return;
	}
	const { config, fileService, files } = preflight;
	const fixResults = await runFix(patterns, config, fileService, {
		resolvedFiles: files,
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

function agentsCommand(reporter: Reporter, kind: "analyze" | "fix"): string {
	return reporter.format === "agents" ? `agents/${kind}` : kind;
}
