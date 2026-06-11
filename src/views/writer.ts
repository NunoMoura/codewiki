export function formatViewJson(view: unknown): string {
	return `${JSON.stringify(view, null, 2)}\n`;
}
