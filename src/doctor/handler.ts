import { statSync } from "node:fs";
import { resolve } from "node:path";
import { acquireLock, ensureDir } from "./mutate";
import { createRun as createRunStore, listRuns, readActions } from "./run-store";
import { detectAll } from "./detectors";
import { applyFixes, gcRuns } from "./fixers";
import { buildCapabilities } from "./capabilities";
import { robotDocs } from "./docs";
import type { DoctorOptions, Finding, RunPaths } from "./types";
import { RUNS_DIR } from "./mutate";
const LOCK_PATH = resolve(".doctor", "doctor.lock");
export async function runDoctor(options: DoctorOptions): Promise<number> {
	// health
	if (options.mode === "health") {
		const findings = await detectAll({
			cwd: process.cwd(),
			patterns: ["src/**/*.ts"],
			quick: true,
			online: options.online,
		});
		const healthy =
			findings.filter((f) => f.severity === "high" || f.severity === "critical").length === 0;
		console.log(healthy ? "healthy" : `unhealthy: ${findings.length} findings`);
		return healthy ? 0 : 1;
	}
	// capabilities
	if (options.mode === "capabilities") {
		printJson(buildCapabilities());
		return 0;
	}
	// robot-docs
	if (options.mode === "robot-docs") {
		process.stdout.write(robotDocs());
		return 0;
	}
	// ls
	if (options.mode === "ls") {
		const runs = await listRuns();
		const out: Array<{ runId: string; actionCount: number; exitCode: number }> = [];
		for (const r of runs) {
			const dir = resolve(RUNS_DIR, r);
			const actions = await readActions(dir);
			let exitCode = 0;
			const reportPath = resolve(dir, "report.json");
			if (await Bun.file(reportPath).exists()) {
				try {
					const rep = JSON.parse(await Bun.file(reportPath).text());
					exitCode = typeof rep.exitCode === "number" ? rep.exitCode : 0;
				} catch {
					// ignore
				}
			}
			out.push({ runId: r, actionCount: actions.length, exitCode });
		}
		printJson(out);
		return 0;
	}
	// gc
	if (options.mode === "gc") {
		if (!options.gcBefore || !options.gcYes) {
			console.error("gc requires --before <date> and --yes");
			return 64;
		}
		const res = gcRuns(options.gcBefore, options.gcYes);
		if (res.refused) {
			console.error("gc refused: missing or invalid args");
			return 64;
		}
		printJson({ removed: res.removed });
		return 0;
	}
	// undo
	if (options.mode === "undo") {
		const runId = await runIdFromArg(options.undo ?? "latest");
		const runDir = resolve(RUNS_DIR, runId);
		let runDirExists = false;
		try {
			runDirExists = statSync(runDir).isDirectory();
		} catch {
			runDirExists = false;
		}
		if (!runDirExists) {
			console.error(`run not found: ${runId}`);
			return 66;
		}
		const actions = (await readActions(runDir)).reverse();
		// restore each
		for (const a of actions) {
			const p = String(a.path);
			const backupRel = p.startsWith(process.cwd()) ? p.slice(process.cwd().length + 1) : p;
			const backupPath = resolve(runDir, "backups", backupRel);
			if (await Bun.file(backupPath).exists()) {
				const { copyFileSync } = await import("node:fs");
				copyFileSync(backupPath, p);
			}
		}
		console.log(`undone run ${runId}`);
		return 0;
	}
	// robot-triage mega-command
	const patterns = ["src/**/*.ts"];
	const detectCtx = {
		cwd: process.cwd(),
		patterns,
		only: options.only,
		quick: options.quick,
		online: options.online,
	};
	// concurrency lock for fix
	let lock: {
		release: () => void;
	} | null = null;
	if (options.fix && !options.dryRun) {
		ensureDir(resolve(process.cwd(), ".doctor"));
		lock = await acquireLock(LOCK_PATH);
		if (!lock) {
			console.error("concurrency lost: another doctor --fix is running");
			return 5;
		}
	}
	try {
		const findings = await detectAll(detectCtx);
		// explain
		if (options.mode === "explain") {
			const f = findings.find((x) => x.id === options.explain);
			if (!f) {
				console.error(`finding not found: ${options.explain}`);
				return 66;
			}
			printJson(f);
			return 0;
		}
		const runId = computeRunIdSync();
		const run = await createRunStore(runId);
		const ctx = {
			runId,
			runDir: run.runDir,
			actionsPath: run.actionsPath,
			backupsDir: run.backupsDir,
			allowedRoots: [process.cwd()],
		};
		// fix
		let outcomes: Awaited<ReturnType<typeof applyFixes>> = [];
		let exitCode = 0;
		if (options.fix) {
			outcomes = await applyFixes(ctx, findings, options.dryRun);
			const anyFailed = outcomes.some((o) => !o.fixed && !o.skipped);
			if (options.dryRun) {
				exitCode = 0;
			} else if (anyFailed) {
				exitCode = 3;
			} else if (outcomes.some((o) => o.fixed)) {
				// re-detect to see remaining
				const remaining = await detectAll(detectCtx);
				exitCode = remaining.length > 0 ? 2 : 0;
			} else {
				exitCode = findings.length > 0 ? 1 : 0;
			}
		} else {
			exitCode = findings.length > 0 ? 1 : 0;
		}
		// robot-triage mega command
		if (options.mode === "robot-triage") {
			const actionsPlanned = findings.filter((f) => f.fixable).map((f) => f.fmId);
			const firstFinding = findings[0];
			const recommended =
				findings.length > 0 && firstFinding
					? `stepdown-rule doctor --fix --only=${firstFinding.subsystem}`
					: "stepdown-rule doctor";
			printJson({
				summary: { total: findings.length, fixable: findings.filter((f) => f.fixable).length },
				findings,
				actions_planned: actionsPlanned,
				recommended_command: recommended,
				capabilities_url: "stepdown-rule doctor capabilities --json",
			});
			// still write report
			await writeReport(run, findings, exitCode, outcomes);
			return exitCode;
		}
		// write report
		writeReport(run, findings, exitCode, outcomes);
		// json/robot output
		if (options.json || options.robot) {
			printJson({
				schemaVersion: 1,
				runId,
				exitCode,
				findings,
				fixes: outcomes,
			});
		} else {
			// human
			console.log(`doctor run ${runId}: ${findings.length} findings`);
			for (const f of findings) {
				console.log(`  [${f.severity}] ${f.id}: ${f.title}`);
				if (f.fixHint) console.log(`      hint: ${f.fixHint}`);
			}
			if (outcomes.length > 0) {
				console.log(`fixes: ${outcomes.filter((o) => o.fixed).length} applied`);
			}
		}
		// exit code for refused unsafe? if findings include refused? We set 4 only if... keep simple.
		return exitCode;
	} finally {
		await lock?.release();
	}
}
function printJson(obj: unknown): void {
	console.log(JSON.stringify(obj, null, 2));
}
async function runIdFromArg(arg: string): Promise<string> {
	if (arg === "latest") {
		const runs = await listRuns();
		if (runs.length === 0) throw new Error("no runs available");
		const first = runs[0];
		if (first === undefined) throw new Error("no runs available");
		return first;
	}
	return arg;
}
function computeRunIdSync(): string {
	const { createHash } = require("node:crypto");
	const iso = new Date().toISOString().replace(/[:.]/g, "");
	const hash = createHash("sha256")
		.update(process.cwd() + iso)
		.digest("hex")
		.slice(0, 6);
	return `${iso}__${hash}`;
}
async function writeReport(
	run: RunPaths,
	findings: Finding[],
	exitCode: number,
	outcomes: Array<{
		findingId: string;
		fmId: string;
		fixed: boolean;
		skipped: boolean;
		reason?: string;
	}>,
): Promise<void> {
	const report = {
		schemaVersion: 1,
		runId: run.runId,
		exitCode,
		findings,
		fixes: outcomes,
	};
	await Bun.write(run.reportJsonPath, JSON.stringify(report, null, 2));
	const md = `# Doctor run ${run.runId}\n\nFindings: ${findings.length}\nExit: ${exitCode}\n`;
	await Bun.write(run.reportMdPath, md);
}
