import { expect, test } from "bun:test";
import { FileConfigJsonSchema } from "../src/config/schema";
import { formatJsonSchema } from "../scripts/format-json-schema";

test("formatJsonSchema output equals the committed stepdown-schema.json", async () => {
	const committed = await Bun.file("./stepdown-schema.json").text();
	expect(formatJsonSchema(FileConfigJsonSchema)).toBe(committed);
});

test("formatJsonSchema is tab-indented and ends with a newline", () => {
	const text = formatJsonSchema({ a: { b: 1 } });
	expect(text).toBe('{\n\t"a": {\n\t\t"b": 1\n\t}\n}\n');
});
