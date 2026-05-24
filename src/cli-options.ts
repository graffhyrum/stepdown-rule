import { Argument, Option } from "commander";

export const patternsArgument = new Argument(
	"[patterns...]",
	'File patterns to analyze (default: "src/**/*.ts")',
).default(["src/**/*.ts"]);

export const ignoreOption = new Option(
	"--ignore <patterns...>",
	"Glob patterns to exclude from analysis (e.g. 'dist/**' '**/*.test.ts')",
).default([]);

export const configOption = new Option(
	"--config <file>",
	"Path to a .stepdownrc.json config file; CLI flags override file values",
).default(".stepdownrc.json");

export const jsonOption = new Option(
	"--json",
	"Emit machine-readable JSON instead of human-readable text; useful for editor integrations",
).default(false);

export const verboseOption = new Option(
	"-v, --verbose",
	"Include circular-dependency warnings in human-readable output",
).default(false);

export const rulesOption = new Option(
	"--rules <ids>",
	"Comma-separated subset of rules to run: 'stepdown' (caller-before-callee at module scope), 'nested' (logic-before-nested-functions inside a body); omit to run all",
);
