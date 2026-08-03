import { afterEach, beforeEach, expect, test } from "bun:test";
import { registerDefaultRules } from "../src/register-default-rules";
import { clear, createRegistry, list as defaultList } from "../src/registry";
import type { ViolationRule } from "../src/rule-context";

beforeEach(() => {
	clear();
});

afterEach(() => {
	clear();
	registerDefaultRules();
});

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

test("registry: createRegistry isolates from default and other instances", () => {
	const a = createRegistry();
	const b = createRegistry();
	a.register(stubRule);
	expect(a.list().map((r) => r.id)).toEqual(["stub"]);
	expect(b.list()).toEqual([]);
	expect(defaultList().every((r) => r.id !== "stub")).toBe(true);
});

test("registry: list returns empty before register", () => {
	expect(defaultList()).toEqual([]);
	const registry = createRegistry();
	expect(registry.list()).toEqual([]);
});

test("registry: register and list", () => {
	const registry = createRegistry();
	registry.register(stubRule);
	registry.register(otherRule);
	expect(registry.list().map((r) => r.id)).toEqual(["stub", "other"]);
});

test("registry: getEnabled() returns all when ids undefined", () => {
	const registry = createRegistry();
	registry.register(stubRule);
	registry.register(otherRule);
	const enabled = registry.getEnabled(undefined);
	expect(enabled.map((r) => r.id)).toEqual(["stub", "other"]);
});

test("registry: getEnabled(ids) filters by id", () => {
	const registry = createRegistry();
	registry.register(stubRule);
	registry.register(otherRule);
	const enabled = registry.getEnabled(["stub"]);
	expect(enabled.map((r) => r.id)).toEqual(["stub"]);
});

test("registry: registerDefaultRules populates fresh registry without mutating isolation", () => {
	const registry = createRegistry();
	registerDefaultRules(registry);
	expect(registry.list().map((r) => r.id).sort()).toEqual(["nested", "stepdown"]);
	const isolated = createRegistry();
	expect(isolated.list()).toEqual([]);
});

test("registry: registerDefaultRules is idempotent on default registry", () => {
	expect(defaultList()).toEqual([]);
	registerDefaultRules();
	registerDefaultRules();
	expect(defaultList().map((r) => r.id).sort()).toEqual(["nested", "stepdown"]);
});

test("registry: clear empties default registry", () => {
	registerDefaultRules();
	expect(defaultList().length).toBeGreaterThan(0);
	clear();
	expect(defaultList()).toEqual([]);
});
