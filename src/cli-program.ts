import { Command } from "commander";
import packageJson from "../package.json" with { type: "json" };
import { registerAgentsCommand } from "./cli-agents";
import { handleUnexpectedError, runHumanAnalyze, runHumanFix } from "./cli-handlers";
import { runDoctor } from "./doctor/handler";
import type { DoctorOptions } from "./doctor/types";
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

	const doctorCommand = new Command();
	doctorCommand
		.name("doctor")
		.description("Diagnose and (with --fix) repair stepdown-rule installation/state")
		.argument("[args...]", "doctor subcommand and its argument")
		.option("--fix", "Apply fixes with backups", false)
		.option("--dry-run", "Print plan without executing", false)
		.option("--json", "Emit JSON", false)
		.option("--robot", "Emit robot JSON", false)
		.option("--explain <id>", "Expand one finding")
		.option("--undo <run>", "Undo a run")
		.option("--capabilities", "Print capabilities JSON", false)
		.option("--health", "One-line liveness", false)
		.option("--robot-docs", "Print agent handbook", false)
		.option("--ls", "List runs", false)
		.option("--gc", "Garbage collect runs", false)
		.option("--before <date>", "GC cutoff date")
		.option("--yes", "GC confirm", false)
		.option("--robot-triage", "Mega-command", false)
		.option("--quick", "Cheap detectors only", false)
		.option("--online", "Enable network probes", false)
		.option("--only <subs>", "Scope detectors (comma)")
		.option("--since <run>", "Diff against run")
		.action(async (args: string[] | undefined, options) => {
			const only = options.only
				? String(options.only)
						.split(",")
						.map((s: string) => s.trim())
				: undefined;
			let mode: DoctorOptions["mode"] = "diagnose";
			const a0 = args && args[0] ? args[0].toLowerCase() : "";
			const a1 = args && args[1] ? args[1] : undefined;
			const sc = a0;
			if (sc === "capabilities" || options.capabilities) mode = "capabilities";
			else if (sc === "health" || options.health) mode = "health";
			else if (sc === "robot-docs" || options.robotDocs) mode = "robot-docs";
			else if (sc === "ls" || options.ls) mode = "ls";
			else if (sc === "gc" || options.gc) mode = "gc";
			else if (sc === "undo" || options.undo) mode = "undo";
			else if (sc === "explain" || options.explain) mode = "explain";
			else if (sc === "robot-triage" || options.robotTriage) mode = "robot-triage";
			if (sc === "undo" && !options.undo) options.undo = a1 ?? "latest";
			if (sc === "explain" && !options.explain) options.explain = a1;
			if (sc === "gc" && !options.before && a1) options.before = a1;
			const opts: DoctorOptions = {
				mode,
				fix: Boolean(options.fix),
				dryRun: Boolean(options.dryRun),
				json: Boolean(options.json),
				robot: Boolean(options.robot),
				explain: options.explain,
				undo: options.undo,
				only,
				since: options.since,
				online: Boolean(options.online),
				quick: Boolean(options.quick),
				gcBefore: options.before,
				gcYes: Boolean(options.yes),
			};
			const code = await runDoctor(opts);
			process.exitCode = code;
		});

	program.addCommand(analyzeCommand, { isDefault: true });
	program.addCommand(fixCommand);
	program.addCommand(doctorCommand);
	registerAgentsCommand(program);
	return program;
}
