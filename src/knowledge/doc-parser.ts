export interface KnowledgeDocFrontmatter {
	id?: string;
	title?: string;
	state?: string;
}

export function splitFrontmatter(markdown: string): { frontmatter: string; body: string } {
	if (markdown.startsWith("---\n") === false) return { frontmatter: "", body: markdown };
	const end = markdown.indexOf("\n---\n", 4);
	if (end === -1) return { frontmatter: "", body: markdown };
	return { frontmatter: markdown.slice(4, end), body: markdown.slice(end + 5) };
}
