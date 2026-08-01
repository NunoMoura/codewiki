export function canonicalIsoTimestamp(value: unknown, field: string): string {
	if (typeof value !== "string" || !value.trim() || value.length > 64) {
		throw new Error(`${field} must be a canonical ISO timestamp.`);
	}
	const timestamp = value.trim();
	const parsed = new Date(timestamp);
	if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== timestamp) {
		throw new Error(`${field} must be a canonical ISO timestamp.`);
	}
	return timestamp;
}
