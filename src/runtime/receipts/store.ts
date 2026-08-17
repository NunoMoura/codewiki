import {join} from "node:path";

import {
	createRunReceipt,
	type RunHandle,
	type RunReceipt,
} from "../contracts.ts";
import {
	assertRetainedRunRawLog,
	readStoredExecutionLedgerVersion,
} from "../evidence/store.ts";
import {
	canonicalJson,
	canonicalJsonDigest,
	type Sha256Digest,
} from "../../utils/canonical-json.ts";
import {
	normalizeRuntimeStateRoot,
	parseStoredJson,
	readRegularFileIfPresent,
	regularFileNames,
	withFileLock,
	writeFileAtomic,
} from "../persistence/files.ts";

const STORE_DIRECTORY = "runtime-receipts-v1";
const RECORD_SCHEMA_VERSION = "1.0.0" as const;

export interface RuntimeReceiptStoreOptions {
	readonly stateRoot: string;
}

interface StoredRunReceiptRecord {
	readonly schemaVersion: typeof RECORD_SCHEMA_VERSION;
	readonly receipt: RunReceipt;
}

export async function commitStoredRunReceipt(input: {
	readonly stateRoot: string;
	readonly expectedReceiptDigest: Sha256Digest | null;
	readonly receipt: RunReceipt;
}): Promise<Readonly<RunReceipt>> {
	const receipt = normalizeReceipt(input.receipt);
	const root = receiptRoot(input.stateRoot);
	const key = receiptKey(receipt.runId, receipt.requestDigest);
	return withFileLock(join(root, "locks", key), async () => {
		const path = receiptPath(root, key);
		const existing = await readReceiptFile(path);
		if (existing) {
			if (existing.receiptDigest === receipt.receiptDigest) {
				await assertReceiptEvidence(input.stateRoot, existing);
				return existing;
			}
			if (existing.receiptDigest !== input.expectedReceiptDigest) {
				throw new Error("Run Receipt commit compare-and-swap failed.");
			}
			throw new Error("Committed Run Receipts are immutable.");
		}
		if (input.expectedReceiptDigest !== null) {
			throw new Error("Run Receipt commit compare-and-swap failed.");
		}
		await assertReceiptEvidence(input.stateRoot, receipt);
		const record = Object.freeze({
			schemaVersion: RECORD_SCHEMA_VERSION,
			receipt,
		});
		await writeFileAtomic(path, `${canonicalJson(record)}\n`);
		return receipt;
	});
}

export async function readStoredRunReceipt(input: {
	readonly stateRoot: string;
	readonly runId: string;
	readonly requestDigest: Sha256Digest;
}): Promise<Readonly<RunReceipt> | null> {
	const receipt = await readReceiptFile(
		receiptPath(
			receiptRoot(input.stateRoot),
			receiptKey(input.runId, input.requestDigest),
		),
	);
	if (!receipt) return null;
	assertReceiptIdentity(receipt, input.runId, input.requestDigest);
	await assertReceiptEvidence(input.stateRoot, receipt);
	return receipt;
}

export async function recoverStoredRunReceipts(
	options: RuntimeReceiptStoreOptions,
): Promise<readonly Readonly<RunReceipt>[]> {
	const root = receiptRoot(options.stateRoot);
	const directory = join(root, "receipts");
	const names = await regularFileNames(directory);
	const receipts: Readonly<RunReceipt>[] = [];
	for (const name of names) {
		if (!/^[0-9a-f]{64}\.json$/.test(name)) continue;
		const receipt = await requiredReceipt(join(directory, name));
		const expectedName = `${receiptKey(receipt.runId, receipt.requestDigest)}.json`;
		if (name !== expectedName) {
			throw new Error("Stored Run Receipt path does not match its identity.");
		}
		await assertReceiptEvidence(options.stateRoot, receipt);
		receipts.push(receipt);
	}
	receipts.sort((left, right) => compareText(
		`${left.runId}\0${left.requestDigest}`,
		`${right.runId}\0${right.requestDigest}`,
	));
	return Object.freeze(receipts);
}

async function assertReceiptEvidence(
	stateRoot: string,
	receipt: RunReceipt,
): Promise<void> {
	if (receipt.executionLedgerDigest) {
		const ledger = await readStoredExecutionLedgerVersion({
			stateRoot,
			runId: receipt.runId,
			requestDigest: receipt.requestDigest,
			ledgerDigest: receipt.executionLedgerDigest,
		});
		if (!ledger || ledger.ledgerDigest !== receipt.executionLedgerDigest) {
			throw new Error("Run Receipt Execution Ledger is missing or mismatched.");
		}
	}
	if (receipt.rawLog) {
		await assertRetainedRunRawLog({stateRoot, reference: receipt.rawLog});
	}
}

function normalizeReceipt(value: RunReceipt): Readonly<RunReceipt> {
	if (!value || typeof value !== "object") {
		throw new Error("Stored Run Receipt must be an object.");
	}
	const handle: RunHandle = {
		runId: value.runId,
		requestDigest: value.requestDigest,
		custody: value.custody,
		runtimeBuild: value.runtimeBuild,
		sessionId: value.sessionId,
		acceptedAt: value.acceptedAt,
	};
	const normalized = createRunReceipt({
		handle,
		outcome: value.outcome,
		finalEventSequence: value.finalEventSequence,
		startedAt: value.startedAt,
		finishedAt: value.finishedAt,
		executionLedgerDigest: value.executionLedgerDigest,
		rawLog: value.rawLog,
		outputDigest: value.outputDigest,
		usageDigest: value.usageDigest,
		cancellationDigest: value.cancellationDigest,
		quiescenceDigest: value.quiescenceDigest,
		custodyGaps: value.custodyGaps,
		operationalGaps: value.operationalGaps,
	});
	if (
		normalized.receiptDigest !== value.receiptDigest ||
		canonicalJson(normalized) !== canonicalJson(value)
	) {
		throw new Error("Stored Run Receipt digest or shape is invalid.");
	}
	return normalized;
}

function receiptRoot(stateRoot: string): string {
	return join(normalizeRuntimeStateRoot(stateRoot), STORE_DIRECTORY);
}

function receiptKey(runId: string, requestDigest: Sha256Digest): string {
	if (typeof runId !== "string" || runId.length === 0) {
		throw new Error("Stored Run Receipt Run id is invalid.");
	}
	return canonicalJsonDigest({runId, requestDigest}).slice("sha256:".length);
}

function receiptPath(root: string, key: string): string {
	return join(root, "receipts", `${key}.json`);
}

async function requiredReceipt(path: string): Promise<Readonly<RunReceipt>> {
	const receipt = await readReceiptFile(path);
	if (!receipt) throw new Error("Stored Run Receipt does not exist.");
	return receipt;
}

async function readReceiptFile(path: string): Promise<Readonly<RunReceipt> | null> {
	const bytes = await readRegularFileIfPresent(path);
	if (!bytes) return null;
	const record = storedRecord(parseStoredJson(bytes, "Stored Run Receipt"));
	return normalizeReceipt(record.receipt);
}

function storedRecord(value: unknown): StoredRunReceiptRecord {
	if (
		!value ||
		typeof value !== "object" ||
		Array.isArray(value) ||
		Object.getPrototypeOf(value) !== Object.prototype
	) {
		throw new Error("Stored Run Receipt record must be an object.");
	}
	const record = value as Record<string, unknown>;
	if (
		record.schemaVersion !== RECORD_SCHEMA_VERSION ||
		Object.keys(record).length !== 2 ||
		!("receipt" in record)
	) {
		throw new Error("Stored Run Receipt record shape is invalid.");
	}
	return record as unknown as StoredRunReceiptRecord;
}

function assertReceiptIdentity(
	receipt: RunReceipt,
	runId: string,
	requestDigest: Sha256Digest,
): void {
	if (receipt.runId !== runId || receipt.requestDigest !== requestDigest) {
		throw new Error("Stored Run Receipt identity does not match the Run.");
	}
}

function compareText(left: string, right: string): number {
	if (left < right) return -1;
	if (left > right) return 1;
	return 0;
}
