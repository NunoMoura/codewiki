import type {Sha256Digest} from "../../utils/canonical-json.ts";

interface ReplayableResult {
	readonly replayed: boolean;
}

interface CompletedEntry<TResult extends ReplayableResult> {
	readonly payloadDigest: Sha256Digest;
	readonly result: TResult;
}

interface PendingEntry<TResult extends ReplayableResult> {
	readonly payloadDigest: Sha256Digest;
	readonly result: Promise<TResult>;
}

export function createSerializedIdempotencyGate<
	TResult extends ReplayableResult,
>(options: {
	readonly maxCompleted: number;
	readonly conflict: (state: "completed" | "running") => Error;
}): {
	readonly run: (input: {
		readonly key: string;
		readonly payloadDigest: Sha256Digest;
		readonly execute: () => Promise<TResult>;
	}) => Promise<TResult>;
} {
	const completed = new Map<string, CompletedEntry<TResult>>();
	const pending = new Map<string, PendingEntry<TResult>>();
	let sequence: Promise<unknown> = Promise.resolve();
	return Object.freeze({
		async run(input: {
			readonly key: string;
			readonly payloadDigest: Sha256Digest;
			readonly execute: () => Promise<TResult>;
		}) {
			const existing = completed.get(input.key);
			if (existing) {
				assertSamePayload(
					existing.payloadDigest,
					input.payloadDigest,
					options.conflict,
					"completed",
				);
				return replay(existing.result);
			}
			const inFlight = pending.get(input.key);
			if (inFlight) {
				assertSamePayload(
					inFlight.payloadDigest,
					input.payloadDigest,
					options.conflict,
					"running",
				);
				return replay(await inFlight.result);
			}
			const result = sequence.then(input.execute);
			sequence = result.then(
				() => undefined,
				() => undefined,
			);
			pending.set(input.key, {payloadDigest: input.payloadDigest, result});
			try {
				const resolved = await result;
				completed.set(input.key, {
					payloadDigest: input.payloadDigest,
					result: resolved,
				});
				trimCompleted(completed, options.maxCompleted);
				return resolved;
			} finally {
				pending.delete(input.key);
			}
		},
	});
}

function assertSamePayload(
	previous: Sha256Digest,
	current: Sha256Digest,
	conflict: (state: "completed" | "running") => Error,
	state: "completed" | "running",
): void {
	if (previous !== current) throw conflict(state);
}

function replay<TResult extends ReplayableResult>(result: TResult): TResult {
	return Object.freeze({...result, replayed: true});
}

function trimCompleted<TResult extends ReplayableResult>(
	entries: Map<string, CompletedEntry<TResult>>,
	maxCompleted: number,
): void {
	while (entries.size > maxCompleted) {
		const oldest = entries.keys().next().value;
		if (typeof oldest !== "string") return;
		entries.delete(oldest);
	}
}
