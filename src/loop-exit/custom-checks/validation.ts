export function deepFreezeValue<T>(value: T): T {
	if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
		return value;
	}
	for (const child of Object.values(value)) deepFreezeValue(child);
	return Object.freeze(value);
}

export function compareCanonicalText(...values: [string, string]): number {
	const [left, right] = values;
	if (left < right) return -1;
	if (left > right) return 1;
	return 0;
}

export function canonicalIsoTimestamp(...input: [unknown, string]): string {
	const [value, field] = input;
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
