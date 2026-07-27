/** Shared native CLI compile helpers for build + release. */

export const RELEASE_COMPILE_TARGETS = [
	"bun-linux-x64",
	"bun-linux-arm64",
	"bun-darwin-x64",
	"bun-darwin-arm64",
	"bun-windows-x64",
] as const;

export type ReleaseCompileTarget = (typeof RELEASE_COMPILE_TARGETS)[number];

export type CompileNativeOptions = {
	target?: ReleaseCompileTarget;
	outfile: string;
	minify?: boolean;
	sourcemap?: boolean;
};

export function isReleaseCompileTarget(target: string): target is ReleaseCompileTarget {
	return RELEASE_COMPILE_TARGETS.some((t) => t === target);
}

/**
 * Compile standalone CLI. Size audit (2026-07-26): --minify wins (~97.7 MiB vs ~102.9 baseline);
 * --sourcemap adds ~4 MiB; --bytecode fails with top-level await.
 */
export async function compileNativeCli(options: CompileNativeOptions): Promise<string> {
	const minify = options.minify ?? true;
	const sourcemap = options.sourcemap ?? false;

	const compileOpts: {
		outfile: string;
		target?: ReleaseCompileTarget;
	} = { outfile: options.outfile };
	if (options.target) {
		compileOpts.target = options.target;
	}

	const result = await Bun.build({
		entrypoints: ["./src/cli.ts"],
		minify,
		sourcemap: sourcemap ? "linked" : "none",
		compile: compileOpts,
	});

	if (!result.success) {
		const details = result.logs.map(String).join("\n");
		throw new Error(`Failed to compile native CLI binary${details ? `\n${details}` : ""}`);
	}

	for (const candidate of resolveCompiledPath(options.outfile, options.target)) {
		if (await Bun.file(candidate).exists()) {
			return candidate;
		}
	}

	throw new Error(`Native CLI binary missing after compile: ${options.outfile}`);
}

/** Outfile path under dist/release/ (no .exe suffix; Bun may still emit .exe). */
export function releaseOutfile(target: ReleaseCompileTarget): string {
	const base = releaseAssetName(target).replace(/\.exe$/, "");
	return `./dist/release/${base}`;
}

export function resolveCompiledPath(outfile: string, target?: ReleaseCompileTarget): string[] {
	if (outfile.endsWith(".exe")) {
		return [outfile];
	}
	const exePath = `${outfile}.exe`;
	const isWindowsTarget = target?.includes("windows") ?? false;
	const isHostWindows = process.platform === "win32" && !target;
	if (isWindowsTarget || isHostWindows) {
		return [exePath, outfile];
	}
	return [outfile, exePath];
}

/** Asset basename for a release target (includes .exe for Windows). */
export function releaseAssetName(target: ReleaseCompileTarget): string {
	const short = target.replace(/^bun-/, "");
	if (short.startsWith("windows-")) {
		return `stepdown-rule-${short}.exe`;
	}
	return `stepdown-rule-${short}`;
}
