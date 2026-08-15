import type { CheckResult } from "./contracts.ts";
import {
	assertSha256Digest,
	type Sha256Digest,
} from "../utils/canonical-json.ts";

export interface LoopExitResultCache {
	readonly get: (key: Sha256Digest) => CheckResult | undefined;
	readonly set: (key: Sha256Digest, result: CheckResult) => void;
	readonly clear: () => void;
	readonly size: () => number;
}

interface CreateLoopExitResultCacheInput {
	readonly maximumEntries?: number;
	readonly ttlMs?: number;
	readonly now?: () => number;
}

interface CacheEntry {
	readonly result: CheckResult;
	readonly expiresAt: number;
}

export function createLoopExitResultCache(
	input: CreateLoopExitResultCacheInput = {},
): LoopExitResultCache {
	const maximumEntries = input.maximumEntries ?? 512;
	const ttlMs = input.ttlMs ?? 30 * 60_000;
	assertPositiveInteger(maximumEntries, "maximumEntries");
	assertPositiveInteger(ttlMs, "ttlMs");
	const now = input.now ?? Date.now;
	const entries = new Map<Sha256Digest, CacheEntry>();
	return Object.freeze({
		get(key: Sha256Digest): CheckResult | undefined {
			assertSha256Digest(key, "Loop exit cache key");
			const entry = entries.get(key);
			if (!entry) return undefined;
			if (entry.expiresAt <= now()) {
				entries.delete(key);
				return undefined;
			}
			entries.delete(key);
			entries.set(key, entry);
			return entry.result;
		},
		set(key: Sha256Digest, result: CheckResult): void {
			assertSha256Digest(key, "Loop exit cache key");
			assertSha256Digest(result.resultDigest, "Check Result digest");
			entries.delete(key);
			entries.set(key, {result, expiresAt: now() + ttlMs});
			while (entries.size > maximumEntries) {
				const oldest = entries.keys().next().value as Sha256Digest | undefined;
				if (!oldest) break;
				entries.delete(oldest);
			}
		},
		clear(): void {
			entries.clear();
		},
		size(): number {
			return entries.size;
		},
	});
}

function assertPositiveInteger(value: number, field: string): void {
	if (!Number.isSafeInteger(value) || value < 1) {
		throw new Error(`Loop exit cache ${field} must be a positive integer.`);
	}
}
