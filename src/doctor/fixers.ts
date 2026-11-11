import { readdirSync, rmSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { mutate, type MutateContext } from "./mutate";
import type { Finding } from "./types";

export interface FixOutcome {
	findingId: string;
	fmId: string;
	fixed: boolean;
	skipped: boolean;
	reason?: string;
	action?: Awaited<ReturnType<typeof mutate>>;
}

export async function applyFixes(
	ctx: MutateContext,
	findings: Finding[],
	dryRun: boolean,
): Promise<FixOutcome[]> {
	const outcomes: FixOutcome[] = [];
	for (const f of findings) {
		if (!f.fixable) {
			outcomes.push({
				findingId: f.id,
				fmId: f.fmId,
				fixed: false,
				skipped: true,
				reason: "not auto-fixable",
			});
			continue;
		}
		if (f.fmId === "gitignore_doctor_missing") {
			const gitignorePath = resolve(process.cwd(), ".gitignore");
			if (dryRun) {
				outcomes.push({
					findingId: f.id,
					fmId: f.fmId,
					fixed: false,
					skipped: true,
					reason: "dry-run: would append .doctor/ to .gitignore",
				});
				continue;
			}
			const action = await mutate(ctx, gitignorePath, "append_gitignore_doctor", (current) => {
				const base = current.endsWith("\n") || current === "" ? current : `${current}\n`;
				return `${base}.doctor/\n`;
			});
			outcomes.push({ findingId: f.id, fmId: f.fmId, fixed: true, skipped: false, action });
		} else if (f.fmId === "stale_runs") {
			outcomes.push({
				findingId: f.id,
				fmId: f.fmId,
				fixed: false,
				skipped: true,
				reason: "use 'doctor gc --before <date> --yes'",
			});
		} else {
			outcomes.push({
				findingId: f.id,
				fmId: f.fmId,
				fixed: false,
				skipped: true,
				reason: "no fixer implemented",
			});
		}
	}
	return outcomes;
}

export function gcRuns(before: string, yes: boolean): { removed: string[]; refused: boolean } {
	if (!yes) return { removed: [], refused: true };
	const cutoff = new Date(before).getTime();
	if (Number.isNaN(cutoff)) return { removed: [], refused: true };
	const runsDir = resolve(process.cwd(), ".doctor", "runs");
	let runsDirExists = false;
	try {
		runsDirExists = statSync(runsDir).isDirectory();
	} catch {
		runsDirExists = false;
	}
	if (!runsDirExists) return { removed: [], refused: false };
	const removed: string[] = [];
	for (const name of readdirSync(runsDir)) {
		const p = join(runsDir, name);
		try {
			const st = statSync(p);
			if (st.isDirectory() && st.mtimeMs < cutoff) {
				rmSync(p, { recursive: true, force: true });
				removed.push(name);
			}
		} catch {
			// skip
		}
	}
	return { removed, refused: false };
}
