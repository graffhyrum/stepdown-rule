import { Command } from "commander";
import packageJson from "../package.json" with { type: "json" };
import { registerAgentsCommand } from "./cli-agents";
import { handleUnexpectedError, runHumanAnalyze, runHumanFix } from "./cli-handlers";
import {
	configOption,
	dryRunOption,
	formatOption,
	ignoreOption,
	jsonOption,
	patternsArgument,
	rulesOption,
	verboseOption,
} from "./cli-options";
import { createReporter, resolveFormat } from "./reporter";

export function createProgram(): Command {
	const program = new Command();
	program
		.name("stepdown-rule")
		.description(
			"TypeScript AST analyzer that enforces the stepdown rule for function organization",
		)
		.version(packageJson.version);

	const analyzeCommand = new Command();
	analyzeCommand
		.name("analyze")
		.description(
			"Analyze files for stepdown rule violations; exits with code 1 when violations are found (default command)",
		)
		.addArgument(patternsArgument)
		.addOption(ignoreOption)
		.addOption(configOption)
		.addOption(jsonOption)
		.addOption(formatOption)
		.addOption(verboseOption)
		.addOption(rulesOption)
		.action(async (patterns: string[], options) => {
			const reporter = createReporter(resolveFormat(options));
			try {
				await runHumanAnalyze(patterns, options, reporter);
			} catch (error) {
				handleUnexpectedError(error, reporter);
			}
		});

	const fixCommand = new Command();
	fixCommand
		.name("fix")
		.description(
			"Reorder functions in-place to satisfy stepdown/nested rules; rewrites only files that have violations",
		)
		.addArgument(patternsArgument)
		.addOption(ignoreOption)
		.addOption(configOption)
		.addOption(jsonOption)
		.addOption(formatOption)
		.addOption(rulesOption)
		.addOption(dryRunOption)
		.action(async (patterns: string[], options) => {
			const reporter = createReporter(resolveFormat(options));
			try {
				await runHumanFix(patterns, options, reporter);
			} catch (error) {
				handleUnexpectedError(error, reporter);
			}
		});

	program.addCommand(analyzeCommand, { isDefault: true });
	program.addCommand(fixCommand);
	registerAgentsCommand(program);
	return program;
}
