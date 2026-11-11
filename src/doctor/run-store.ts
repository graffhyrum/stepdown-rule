import { createHash } from "node:crypto";
import { readdirSync, statSync, symlinkSync, lstatSync } from "node:fs";
import { join, resolve } from "node:path";
import { ensureDir, RUNS_DIR } from "./mutate";
import type { RunPaths } from "./types";

export function computeRunId(targetSha: string): string {
	const iso = new Date().toISOString().replace(/[:.]/g, "");
	const hash = createHash("sha256")
		.update(targetSha + iso)
		.digest("hex")
		.slice(0, 6);
	return `${iso}__${hash}`;
}

export async function createRun(runId: string): Promise<RunPaths> {
	const runDir = resolve(RUNS_DIR, runId);
	const backupsDir = join(runDir, "backups");
	ensureDir(runDir);
	ensureDir(backupsDir);
	const actionsPath = join(runDir, "actions.jsonl");
	const reportJsonPath = join(runDir, "report.json");
	const reportMdPath = join(runDir, "report.md");
	if (!(await Bun.file(actionsPath).exists())) {
		await Bun.write(actionsPath, "");
	}
	await updateLatestSymlink(runDir);
	return { runId, runDir, backupsDir, actionsPath, reportJsonPath, reportMdPath };
}

async function updateLatestSymlink(runDir: string): Promise<void> {
	const latest = resolve(".doctor", "latest");
	try {
		const st = lstatSync(latest);
		if (st.isSymbolicLink() || st.isFile()) await Bun.file(latest).delete();
	} catch {
		// not exists
	}
	try {
		symlinkSync(runDir, latest, "dir");
	} catch {
		// ignore
	}
}

export async function listRuns(): Promise<string[]> {
	let entries: string[];
	try {
		entries = readdirSync(RUNS_DIR);
	} catch {
		return [];
	}
	const withMtime = entries.map((name) => {
		const st = statSync(resolve(RUNS_DIR, name));
		return { name, mtime: st.mtimeMs };
	});
	return withMtime.sort((a, b) => b.mtime - a.mtime).map((x) => x.name);
}

export async function readActions(runDir: string): Promise<Array<Record<string, unknown>>> {
	const p = join(runDir, "actions.jsonl");
	if (!(await Bun.file(p).exists())) return [];
	const text = await Bun.file(p).text();
	const lines = text.split("\n").filter((l) => l.trim());
	const out: Array<Record<string, unknown>> = [];
	for (const l of lines) {
		try {
			out.push(JSON.parse(l));
		} catch {
			// skip
		}
	}
	return out;
}
