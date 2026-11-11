import packageJson from "../../package.json" with { type: "json" };

export const DOCTOR_CONTRACT_VERSION = 1;
export const SCHEMA_VERSION = 1;

export const EXIT_CODES: Record<number, string> = {
	0: "healthy",
	1: "findings present (no --fix)",
	2: "fix attempted, partial",
	3: "fix failed and rolled back",
	4: "refused unsafe",
	5: "concurrency lost (lock held)",
	6: "online required",
	64: "usage error",
	66: "no input",
	73: "cannot create output",
	74: "I/O error",
};

export function buildCapabilities() {
	return {
		tool: "stepdown-rule",
		toolVersion: packageJson.version,
		doctorVersion: "0.1.0",
		doctorContractVersion: DOCTOR_CONTRACT_VERSION,
		schemaVersion: SCHEMA_VERSION,
		detectors: [
			"node_modules_missing",
			"build_artifact_missing",
			"config_invalid",
			"gitignore_doctor_missing",
			"no_files_matched",
			"parse_error",
			"stale_runs",
		],
		fixers: ["gitignore_doctor_missing"],
		exitCodes: EXIT_CODES,
		envVars: ["NO_COLOR", "FORCE_COLOR"],
		runArtifactSchema: {
			runDir: ".doctor/runs/<run-id>/",
			files: [
				"report.json",
				"report.md",
				"actions.jsonl",
				"backups/",
				"stdout.json",
				"stderr.log",
				"undo.sh",
			],
		},
	};
}
