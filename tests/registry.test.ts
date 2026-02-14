import { expect, test } from "bun:test";
import { getEnabled, list, register } from "../src/registry";
import type { ViolationRule } from "../src/rule-context";

const stubRule: ViolationRule = {
	id: "stub",
	analyze: () => [],
	fix: (ctx) => ctx.parsedFile.content,
};

const otherRule: ViolationRule = {
	id: "other",
	analyze: () => [],
	fix: (ctx) => ctx.parsedFile.content,
};

test("registry: list returns empty before register", () => {
	expect(list()).toEqual([]);
});

test("registry: register and list", () => {
	register(stubRule);
	register(otherRule);
	expect(list().map((r) => r.id)).toEqual(["stub", "other"]);
});

test("registry: getEnabled() returns all when ids undefined", () => {
	const enabled = getEnabled(undefined);
	expect(enabled.map((r) => r.id)).toEqual(["stub", "other"]);
});

test("registry: getEnabled(ids) filters by id", () => {
	const enabled = getEnabled(["stub"]);
	expect(enabled.map((r) => r.id)).toEqual(["stub"]);
});
