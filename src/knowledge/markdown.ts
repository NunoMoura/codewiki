export function markdownTitle(markdown: string): string | undefined {
	return markdown.split("\n").find((line) => line.startsWith("# "))?.slice(2).trim();
}
