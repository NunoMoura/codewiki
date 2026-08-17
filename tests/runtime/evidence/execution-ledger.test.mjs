import assert from "node:assert/strict";
import test from "node:test";

import {
	appendExecutionLedgerEntry,
	assertExecutionLedger,
	createExecutionLedger,
	createExecutionLedgerHeader,
} from "../../../src/runtime/evidence/execution-ledger.ts";
import {runRequest} from "../helpers/run-evidence.mjs";

function ledgerHeader() {
	return createExecutionLedgerHeader({
		request: runRequest(),
		createdAt: "2026-08-18T10:00:01.000Z",
	});
}

test("Execution Ledger retains exact payloads in a contiguous digest chain", () => {
	const initial = createExecutionLedger(ledgerHeader());
	const withInput = appendExecutionLedgerEntry(initial, {
		kind: "static-input",
		occurredAt: "2026-08-18T10:00:02.000Z",
		modelVisible: true,
		payload: {systemPrompt: "System prompt", prompt: "Run prompt"},
	});
	const completed = appendExecutionLedgerEntry(withInput, {
		kind: "output",
		occurredAt: "2026-08-18T10:00:03.000Z",
		modelVisible: false,
		payload: {text: "Completed"},
	});

	assert.equal(initial.entries.length, 0);
	assert.equal(completed.entries.length, 2);
	assert.equal(completed.entries[0].sequence, 0);
	assert.equal(completed.entries[1].sequence, 1);
	assert.equal(completed.entries[1].previousDigest, completed.entries[0].entryDigest);
	assert.equal(completed.entries[0].payload.prompt, "Run prompt");
	assert.equal(completed.entries[0].payload.systemPrompt, "System prompt");
	assert.deepEqual(assertExecutionLedger(completed), completed);
});

test("Execution Ledger rejects payload tampering, sequence gaps, and broken hash links", () => {
	const ledger = appendExecutionLedgerEntry(createExecutionLedger(ledgerHeader()), {
		kind: "model-request",
		occurredAt: "2026-08-18T10:00:02.000Z",
		modelVisible: true,
		payload: {messages: ["hello"]},
	});
	const tamperedPayload = structuredClone(ledger);
	tamperedPayload.entries[0].payload.messages[0] = "changed";
	assert.throws(() => assertExecutionLedger(tamperedPayload), /payload digest/);

	const sequenceGap = structuredClone(ledger);
	sequenceGap.entries[0].sequence = 2;
	assert.throws(() => assertExecutionLedger(sequenceGap), /not contiguous/);

	const brokenLink = appendExecutionLedgerEntry(ledger, {
		kind: "model-output",
		occurredAt: "2026-08-18T10:00:03.000Z",
		modelVisible: true,
		payload: {text: "answer"},
	});
	const tamperedLink = structuredClone(brokenLink);
	tamperedLink.entries[1].previousDigest = ledger.header.headerDigest;
	assert.throws(() => assertExecutionLedger(tamperedLink), /hash chain/);
});
