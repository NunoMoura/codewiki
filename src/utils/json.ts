export function parseJsonObject<T>(text: string, label = "JSON input"): T {
	try {
		return JSON.parse(text) as T;
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		throw new Error(`Invalid ${label}: ${reason}`);
	}
}
