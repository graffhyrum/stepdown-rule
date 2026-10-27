// Matches .oxfmtrc.json (tabs) so a build does not dirty the tracked schema file.
export function formatJsonSchema(schema: unknown): string {
	return `${JSON.stringify(schema, null, "\t")}\n`;
}
