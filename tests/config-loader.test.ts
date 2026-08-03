import { expect, test } from "bun:test";
import { loadConfig } from "../src/config/loader";
import { withTempFile } from "./helpers";

test("loadConfig with no path returns empty ignore", async () => {
	expect(await loadConfig()).toEqual({ ignore: [] });
	expect(await loadConfig(undefined)).toEqual({ ignore: [] });
});

test("loadConfig missing file returns defaults", async () => {
	expect(await loadConfig("fixtures/does-not-exist-stepdownrc.json")).toEqual({ ignore: [] });
});

test("loadConfig valid JSON returns ignore list", async () => {
	await withTempFile(
		JSON.stringify({ ignore: ["**/vendor/**"] }),
		async (file) => {
			expect(await loadConfig(file)).toEqual({ ignore: ["**/vendor/**"] });
		},
		undefined,
		"rc.json",
	);
});

test("loadConfig invalid JSON throws", async () => {
	await withTempFile(
		"{ not json",
		async (file) => {
			await expect(loadConfig(file)).rejects.toThrow(/Invalid JSON in config file/);
		},
		undefined,
		"rc.json",
	);
});

test("loadConfig schema failure throws", async () => {
	await withTempFile(
		JSON.stringify({ ignore: "not-an-array" }),
		async (file) => {
			await expect(loadConfig(file)).rejects.toThrow(/Config validation failed/);
		},
		undefined,
		"rc.json",
	);
});
