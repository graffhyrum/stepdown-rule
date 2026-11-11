import { createHash } from "node:crypto";
import { mkdirSync, renameSync } from "node:fs";
import { open } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import type { ActionRecord } from "./types";

export const DOCTOR_DIR = ".doctor";
export const RUNS_DIR = ".doctor/runs";

export interface MutateContext {
	runId: string;
	runDir: string;
	actionsPath: string;
	backupsDir: string;
	allowedRoots: string[];
}

export async function mutate(
	ctx: MutateContext,
	targetPath: string,
	op: string,
	apply: (current: string) => string,
): Promise<ActionRecord> {
	if (!isPathAllowed(targetPath, ctx.allowedRoots)) {
		throw new Error(`mutate refused: path outside allowed roots: ${targetPath}`);
	}
	ensureDir(ctx.backupsDir);
	const rel = relative(process.cwd(), resolve(targetPath));
	const backupPath = resolve(ctx.backupsDir, rel);
	ensureDir(dirname(backupPath));
	let beforeHash = "";
	let current = "";
	try {
		const f = Bun.file(targetPath);
		if (await f.exists()) {
			current = await f.text();
			beforeHash = sha256Buffer(Buffer.from(current));
			await Bun.write(backupPath, f);
		} else {
			current = "";
			beforeHash = sha256Buffer(Buffer.from(""));
			await Bun.write(backupPath, "");
		}
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
		current = "";
		beforeHash = sha256Buffer(Buffer.from(""));
		await Bun.write(backupPath, "");
	}
	const next = apply(current);
	const afterHash = sha256Buffer(Buffer.from(next));
	await atomicWriteFile(targetPath, next);
	const record: ActionRecord = {
		path: targetPath,
		op,
		beforeHash,
		afterHash,
		timestamp: new Date().toISOString(),
		runId: ctx.runId,
	};
	const line = `${JSON.stringify(record)}\n`;
	await appendLine(ctx.actionsPath, line);
	return record;
}

async function appendLine(path: string, line: string): Promise<void> {
	ensureDir(dirname(path));
	await Bun.write(
		path,
		(await (async () => {
			const f = Bun.file(path);
			return (await f.exists()) ? await f.text() : "";
		})()) + line,
	);
}

export async function atomicWriteFile(path: string, content: string | Buffer): Promise<void> {
	const dir = dirname(path);
	ensureDir(dir);
	const tmp = `${path}.tmp.${process.pid}.${Date.now()}`;
	await Bun.write(tmp, content);
	renameSync(tmp, path);
}

export async function sha256File(path: string): Promise<string> {
	const buf = await Bun.file(path).arrayBuffer();
	return createHash("sha256").update(Buffer.from(buf)).digest("hex");
}

export function sha256Buffer(buf: Buffer): string {
	return createHash("sha256").update(buf).digest("hex");
}

export function ensureDir(path: string): void {
	mkdirSync(path, { recursive: true });
}

export async function acquireLock(
	lockPath: string,
): Promise<{ release: () => Promise<void> } | null> {
	try {
		const handle = await open(lockPath, "wx");
		await Bun.write(lockPath, String(process.pid));
		await handle.close();
		return {
			release: async () => {
				try {
					const owner = (await Bun.file(lockPath).text()).trim();
					if (owner === String(process.pid)) {
						await Bun.file(lockPath).delete();
					}
				} catch {
					// ignore
				}
			},
		};
	} catch {
		return null;
	}
}

export function isPathAllowed(targetPath: string, allowedRoots: string[]): boolean {
	const abs = resolve(targetPath);
	return allowedRoots.some((root) => {
		const r = resolve(root);
		return abs === r || abs.startsWith(r + sep);
	});
}
