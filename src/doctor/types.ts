export type Severity = "info" | "low" | "medium" | "high" | "critical";

export interface Finding {
	id: string;
	fmId: string;
	severity: Severity;
	subsystem: string;
	title: string;
	detail: string;
	evidence?: string;
	fixable: boolean;
	fixHint?: string;
}

export interface RunPaths {
	runId: string;
	runDir: string;
	backupsDir: string;
	actionsPath: string;
	reportJsonPath: string;
	reportMdPath: string;
}

export interface ActionRecord {
	path: string;
	op: string;
	beforeHash: string;
	afterHash: string;
	timestamp: string;
	runId: string;
}

export type DoctorMode =
	| "diagnose"
	| "fix"
	| "dry-run"
	| "explain"
	| "undo"
	| "capabilities"
	| "health"
	| "robot-docs"
	| "ls"
	| "gc"
	| "robot-triage";

export interface DoctorOptions {
	mode: DoctorMode;
	fix: boolean;
	dryRun: boolean;
	json: boolean;
	robot: boolean;
	explain?: string;
	undo?: string;
	only?: string[];
	since?: string;
	online: boolean;
	quick: boolean;
	gcBefore?: string;
	gcYes: boolean;
}
