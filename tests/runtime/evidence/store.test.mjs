import assert from "node:assert/strict";
import {mkdtemp, readFile, readdir, rm, writeFile} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import test from "node:test";

import {
	appendStoredExecutionLedger,
	openStoredExecutionLedger,
	readRetainedRunRawLog,
	readStoredExecutionLedger,
	recoverStoredExecutionLedgers,
	retainRunRawLog,
} from "../../../src/runtime/evidence/store.ts";
import {
	createExecutionLedgerHeader,
} from "../../../src/runtime/evidence/execution-ledger.ts";
import {
	rawLogReference,
	runRequest,
} from "../helpers/run-evidence.mjs";

async function temporaryState() {
	return mkdtemp(join(tmpdir(), "codewiki-runtime-evidence-"));
}

test("durable Execution Ledger survives restart and enforces expected-head CAS", async () => {
	const stateRoot = await temporaryState();
	try {
		const request = runRequest();
		const header = createExecutionLedgerHeader({
			request,
			createdAt: "2026-08-18T10:00:01.000Z",
		});
		const initial = await openStoredExecutionLedger({stateRoot, header});
		const appended = await appendStoredExecutionLedger({
			stateRoot,
			runId: request.runId,
			requestDigest: request.requestDigest,
			expectedLedgerDigest: initial.ledgerDigest,
			entry: {
				kind: "static-input",
				occurredAt: "2026-08-18T10:00:02.000Z",
				modelVisible: true,
				payload: {prompt: "exact prompt"},
			},
		});
		await assert.rejects(
			appendStoredExecutionLedger({
				stateRoot,
				runId: request.runId,
				requestDigest: request.requestDigest,
				expectedLedgerDigest: initial.ledgerDigest,
				entry: {
					kind: "output",
					occurredAt: "2026-08-18T10:00:03.000Z",
					modelVisible: false,
					payload: {text: "stale write"},
				},
			}),
			/expected-head compare-and-swap failed/,
		);

		const recovered = await readStoredExecutionLedger({
			stateRoot,
			runId: request.runId,
			requestDigest: request.requestDigest,
		});
		assert.equal(recovered.ledgerDigest, appended.ledgerDigest);
		assert.deepEqual(await recoverStoredExecutionLedgers({stateRoot}), [appended]);
		assert.equal(
			(await openStoredExecutionLedger({stateRoot, header})).ledgerDigest,
			appended.ledgerDigest,
		);
	} finally {
		await rm(stateRoot, {recursive: true, force: true});
	}
});

test("raw Agent Session logs are retained by digest and reverified on every read", async () => {
	const stateRoot = await temporaryState();
	try {
		const request = runRequest();
		const content = Buffer.from('{"type":"session/start"}\n', "utf8");
		const reference = rawLogReference(request, content);
		await retainRunRawLog({stateRoot, reference, content});
		assert.deepEqual(
			await readRetainedRunRawLog({stateRoot, reference}),
			content,
		);
		await retainRunRawLog({stateRoot, reference, content});

		const rawPath = join(
			stateRoot,
			"runtime-evidence-v1",
			"raw-logs",
			`${reference.digest.slice("sha256:".length)}.bin`,
		);
		await writeFile(rawPath, Buffer.from("tampered", "utf8"));
		await assert.rejects(
			readRetainedRunRawLog({stateRoot, reference}),
			/byte length|digest/,
		);
	} finally {
		await rm(stateRoot, {recursive: true, force: true});
	}
});

test("Execution Ledger recovery rejects corrupted persisted bytes", async () => {
	const stateRoot = await temporaryState();
	try {
		const request = runRequest();
		await openStoredExecutionLedger({
			stateRoot,
			header: createExecutionLedgerHeader({
				request,
				createdAt: "2026-08-18T10:00:01.000Z",
			}),
		});
		const directory = join(stateRoot, "runtime-evidence-v1", "ledgers");
		const [name] = await readdir(directory);
		const path = join(directory, name);
		const stored = JSON.parse(await readFile(path, "utf8"));
		stored.header.runId = "run-tampered";
		await writeFile(path, `${JSON.stringify(stored)}\n`);
		await assert.rejects(
			recoverStoredExecutionLedgers({stateRoot}),
			/header digest is invalid/,
		);
	} finally {
		await rm(stateRoot, {recursive: true, force: true});
	}
});
