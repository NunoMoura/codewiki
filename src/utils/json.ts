export function parseJsonObject<T>(text: string): T {
	return JSON.parse(text) as T;
}
