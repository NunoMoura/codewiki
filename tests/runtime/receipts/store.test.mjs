import assert from "node:assert/strict";
import {mkdtemp, readdir, rm, writeFile} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import test from "node:test";

import {createRunReceipt} from "../../../src/runtime/contracts.ts";
import {
	appendStoredExecutionLedger,
	openStoredExecutionLedger,
	retainRunRawLog,
} from "../../../src/runtime/evidence/store.ts";
import {createExecutionLedgerHeader} from "../../../src/runtime/evidence/execution-ledger.ts";
import {
	commitStoredRunReceipt,
	readStoredRunReceipt,
	recoverStoredRunReceipts,
} from "../../../src/runtime/receipts/store.ts";
import {
	completedReceipt,
	digest,
	rawLogReference,
	runRequest,
} from "../helpers/run-evidence.mjs";

async function temporaryState() {
	return mkdtemp(join(tmpdir(), "codewiki-runtime-receipts-"));
}

async function retainedEvidence(stateRoot, request) {
	const initial = await openStoredExecutionLedger({
		stateRoot,
		header: createExecutionLedgerHeader({
			request,
			createdAt: "2026-08-18T10:00:01.000Z",
		}),
	});
	const ledger = await appendStoredExecutionLedger({
		stateRoot,
		runId: request.runId,
		requestDigest: request.requestDigest,
		expectedLedgerDigest: initial.ledgerDigest,
		entry: {
			kind: "output",
			occurredAt: "2026-08-18T10:00:03.000Z",
			modelVisible: false,
			payload: {text: "completed"},
		},
	});
	const content = Buffer.from('{"type":"assistant/message"}\n', "utf8");
	const rawLog = rawLogReference(request, content);
	await retainRunRawLog({stateRoot, reference: rawLog, content});
	return {ledger, rawLog};
}

test("Run Receipt commits only after durable ledger and raw-log evidence", async () => {
	const stateRoot = await temporaryState();
	try {
		const request = runRequest();
		const {ledger, rawLog} = await retainedEvidence(stateRoot, request);
		const receipt = completedReceipt(request, ledger.ledgerDigest, rawLog);
		const committed = await commitStoredRunReceipt({
			stateRoot,
			expectedReceiptDigest: null,
			receipt,
		});

		assert.equal(committed.receiptDigest, receipt.receiptDigest);
		assert.equal(
			(await readStoredRunReceipt({
				stateRoot,
				runId: request.runId,
				requestDigest: request.requestDigest,
			})).receiptDigest,
			receipt.receiptDigest,
		);
		assert.deepEqual(await recoverStoredRunReceipts({stateRoot}), [receipt]);
		await appendStoredExecutionLedger({
			stateRoot,
			runId: request.runId,
			requestDigest: request.requestDigest,
			expectedLedgerDigest: ledger.ledgerDigest,
			entry: {
				kind: "usage",
				occurredAt: "2026-08-18T10:00:04.000Z",
				modelVisible: false,
				payload: {outputTokens: 1},
			},
		});
		assert.equal(
			(await readStoredRunReceipt({
				stateRoot,
				runId: request.runId,
				requestDigest: request.requestDigest,
			})).receiptDigest,
			receipt.receiptDigest,
		);
		assert.equal(
			(await commitStoredRunReceipt({
				stateRoot,
				expectedReceiptDigest: null,
				receipt,
			})).receiptDigest,
			receipt.receiptDigest,
		);
	} finally {
		await rm(stateRoot, {recursive: true, force: true});
	}
});

test("Run Receipt commit fails closed for missing evidence and conflicting immutable receipt", async () => {
	const stateRoot = await temporaryState();
	try {
		const request = runRequest();
		const content = Buffer.from("{}\n", "utf8");
		const rawLog = rawLogReference(request, content);
		const missing = completedReceipt(request, digest("missing-ledger"), rawLog);
		await assert.rejects(
			commitStoredRunReceipt({
				stateRoot,
				expectedReceiptDigest: null,
				receipt: missing,
			}),
			/Execution Ledger is missing or mismatched/,
		);

		const {ledger, rawLog: retainedRawLog} = await retainedEvidence(stateRoot, request);
		const receipt = completedReceipt(request, ledger.ledgerDigest, retainedRawLog);
		await commitStoredRunReceipt({
			stateRoot,
			expectedReceiptDigest: null,
			receipt,
		});
		const conflicting = createRunReceipt({
			handle: {
				runId: receipt.runId,
				requestDigest: receipt.requestDigest,
				custody: receipt.custody,
				runtimeBuild: receipt.runtimeBuild,
				sessionId: receipt.sessionId,
				acceptedAt: receipt.acceptedAt,
			},
			outcome: receipt.outcome,
			finalEventSequence: receipt.finalEventSequence,
			startedAt: receipt.startedAt,
			finishedAt: receipt.finishedAt,
			executionLedgerDigest: receipt.executionLedgerDigest,
			rawLog: receipt.rawLog,
			outputDigest: digest("different-output"),
			usageDigest: receipt.usageDigest,
			cancellationDigest: receipt.cancellationDigest,
			quiescenceDigest: receipt.quiescenceDigest,
			custodyGaps: receipt.custodyGaps,
			operationalGaps: receipt.operationalGaps,
		});
		await assert.rejects(
			commitStoredRunReceipt({
				stateRoot,
				expectedReceiptDigest: null,
				receipt: conflicting,
			}),
			/compare-and-swap failed/,
		);
		await assert.rejects(
			commitStoredRunReceipt({
				stateRoot,
				expectedReceiptDigest: receipt.receiptDigest,
				receipt: conflicting,
			}),
			/immutable/,
		);
	} finally {
		await rm(stateRoot, {recursive: true, force: true});
	}
});

test("Run Receipt recovery rejects corrupted committed records", async () => {
	const stateRoot = await temporaryState();
	try {
		const request = runRequest();
		const {ledger, rawLog} = await retainedEvidence(stateRoot, request);
		await commitStoredRunReceipt({
			stateRoot,
			expectedReceiptDigest: null,
			receipt: completedReceipt(request, ledger.ledgerDigest, rawLog),
		});
		const directory = join(stateRoot, "runtime-receipts-v1", "receipts");
		const [name] = await readdir(directory);
		await writeFile(join(directory, name), '{"schemaVersion":"1.0.0"}\n');
		await assert.rejects(
			recoverStoredRunReceipts({stateRoot}),
			/record shape is invalid/,
		);
	} finally {
		await rm(stateRoot, {recursive: true, force: true});
	}
});
