import { Argument, Command, Option } from "commander";
import { emitCliError, type CliErrorPayload } from "./cli-errors";
import { exitCodeFromErrors, ruleDescription } from "./cli-output";
import {
	configOption,
	dryRunOption,
	ignoreOption,
	patternsArgument,
	rulesOption,
} from "./cli-options";
import {
	buildConfigFromCliSafe,
	resolvePatterns,
	runAnalyze,
	runFix,
	type CliOptions,
} from "./cli-runners";
import {
	AgentsAnalyzeEnvelopeJsonSchema,
	AgentsFixEnvelopeJsonSchema,
	FileConfigJsonSchema,
} from "./config/schema";
import { ExitUsage } from "./exit-codes";
import { list as listRules } from "./registry";
import { createReporter } from "./reporter";
import { FileService } from "./services/FileService";
import type { Config } from "./types";

const schemaTargetArgument = new Argument(
	"<target>",
	"Schema target: config | analyze-output | fix-output | rules",
);

const agentsReporter = createReporter("agents");

type AgentsPreflight =
	| {
			ok: true;
			config: Config;
			fileService: FileService;
			files: string[];
	  }
	| {
			ok: false;
			errors: CliErrorPayload[];
	  };

export function registerAgentsCommand(program: Command): void {
	const agents = new Command("agents");
	agents.description("Agent-optimized commands: stable JSON envelope on stdout");
	const analyzeCmd = new Command("analyze");
	analyzeCmd
		.description("Analyze files; stdout is a single JSON envelope")
		.addArgument(patternsArgument)
		.addOption(ignoreOption)
		.addOption(configOption)
		.addOption(rulesOption)
		.addOption(
			new Option("--include-graph", "Include dependencyGraph in each file result").default(false),
		)
		.action(async (patterns: string[], options) => {
			try {
				await runAgentsAnalyze(patterns, options);
			} catch (error) {
				handleAgentsFailure("agents/analyze", error);
			}
		});
	const fixCmd = new Command("fix");
	fixCmd
		.description("Fix violations; stdout is a single JSON envelope")
		.addArgument(patternsArgument)
		.addOption(ignoreOption)
		.addOption(configOption)
		.addOption(rulesOption)
		.addOption(dryRunOption)
		.addOption(
			new Option(
				"--include-content",
				"Include originalContent and fixedContent in results",
			).default(false),
		)
		.action(async (patterns: string[], options) => {
			try {
				await runAgentsFix(patterns, options);
			} catch (error) {
				handleAgentsFailure("agents/fix", error);
			}
		});
	const schemaCmd = new Command("schema");
	schemaCmd
		.description("Emit JSON Schema or rule catalog to stdout")
		.addArgument(schemaTargetArgument)
		.action((target: string) => {
			try {
				runAgentsSchema(target);
			} catch (error) {
				handleAgentsFailure("agents/schema", error);
			}
		});
	agents.addCommand(analyzeCmd);
	agents.addCommand(fixCmd);
	agents.addCommand(schemaCmd);
	program.addCommand(agents);
}

async function runAgentsFix(
	patterns: string[],
	options: CliOptions & {
		dryRun?: boolean;
		includeContent?: boolean;
	},
): Promise<void> {
	const preflight = await agentsPreflight(patterns, options);
	if (!preflight.ok) {
		process.exitCode = agentsReporter.reportEarlyFailure("fix", preflight.errors, {
			command: "agents/fix",
		});
		return;
	}
	const dryRun = options.dryRun ?? false;
	const fixResults = await runFix(patterns, preflight.config, preflight.fileService, {
		dryRun,
		resolvedFiles: preflight.files,
	});
	process.exitCode = agentsReporter.reportFix(fixResults, {
		dryRun,
		includeContent: options.includeContent ?? false,
		command: "agents/fix",
	});
}

async function runAgentsAnalyze(
	patterns: string[],
	options: CliOptions & {
		includeGraph?: boolean;
	},
): Promise<void> {
	const preflight = await agentsPreflight(patterns, options);
	if (!preflight.ok) {
		process.exitCode = agentsReporter.reportEarlyFailure("analyze", preflight.errors, {
			command: "agents/analyze",
		});
		return;
	}
	const results = await runAnalyze(
		patterns,
		preflight.config,
		preflight.fileService,
		preflight.files,
	);
	process.exitCode = agentsReporter.reportAnalyze(results, {
		includeGraph: options.includeGraph ?? false,
		command: "agents/analyze",
	});
}

function handleAgentsFailure(command: string, error: unknown): void {
	const payload = internalErrorPayload(error);
	emitCliError(payload);
	if (command === "agents/analyze") {
		process.exitCode = agentsReporter.reportEarlyFailure("analyze", [payload], { command });
		return;
	}
	if (command === "agents/fix") {
		process.exitCode = agentsReporter.reportEarlyFailure("fix", [payload], { command });
		return;
	}
	process.exitCode = exitCodeFromErrors([payload]);
}

function internalErrorPayload(error: unknown): CliErrorPayload {
	return {
		code: "INTERNAL_ERROR",
		message: error instanceof Error ? error.message : String(error),
		hint: "Report this issue with the command and file patterns used.",
	};
}

async function agentsPreflight(patterns: string[], options: CliOptions): Promise<AgentsPreflight> {
	const errors: CliErrorPayload[] = [];
	const built = await buildConfigFromCliSafe(options);
	if ("error" in built) {
		errors.push(built.error);
		emitCliError(built.error);
		return { ok: false, errors };
	}
	const fileService = new FileService({ ignore: built.config.ignore });
	const resolved = await resolvePatterns(fileService, patterns);
	if ("error" in resolved) {
		errors.push(resolved.error);
		emitCliError(resolved.error);
		return { ok: false, errors };
	}
	return { ok: true, config: built.config, fileService, files: resolved.files };
}

function runAgentsSchema(target: string): void {
	switch (target) {
		case "config":
			process.stdout.write(`${JSON.stringify(FileConfigJsonSchema)}\n`);
			return;
		case "analyze-output":
			process.stdout.write(`${JSON.stringify(AgentsAnalyzeEnvelopeJsonSchema)}\n`);
			return;
		case "fix-output":
			process.stdout.write(`${JSON.stringify(AgentsFixEnvelopeJsonSchema)}\n`);
			return;
		case "rules": {
			const rules = listRules().map((r) => ({ id: r.id, description: ruleDescription(r.id) }));
			process.stdout.write(`${JSON.stringify(rules)}\n`);
			return;
		}
		default:
			emitCliError({
				code: "USAGE",
				message: `Unknown schema target: ${target}`,
				hint: "Use one of: config, analyze-output, fix-output, rules",
			});
			process.exitCode = ExitUsage;
	}
}
