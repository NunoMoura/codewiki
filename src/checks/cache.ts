import {
	normalizeExecutionIdentity,
	type CheckExecutionIdentity,
	type CheckInvocation,
	type CheckResult,
} from "./contracts.ts";
import {assertValidCheckResult} from "./results.ts";
import {canonicalJsonDigest, type Sha256Digest} from "../utils/canonical-json.ts";

export interface CheckResultCache {
	get(key: Sha256Digest): CheckResult | undefined | Promise<CheckResult | undefined>;
	set(key: Sha256Digest, result: CheckResult): void | Promise<void>;
}

export function checkResultCacheKey(input: {
	readonly invocation: CheckInvocation;
	readonly execution: CheckExecutionIdentity;
}): Sha256Digest {
	return canonicalJsonDigest({
		protocolVersion: "1.0.0",
		invocationDigest: input.invocation.invocationDigest,
		execution: normalizeExecutionIdentity(input.execution),
	});
}

export class InMemoryCheckResultCache implements CheckResultCache {
	readonly #entries = new Map<Sha256Digest, CheckResult>();

	get(key: Sha256Digest): CheckResult | undefined {
		return this.#entries.get(key);
	}

	set(key: Sha256Digest, result: CheckResult): void {
		assertValidCheckResult(result);
		this.#entries.set(key, result);
	}
}
