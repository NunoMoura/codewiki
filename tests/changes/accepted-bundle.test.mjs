import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	acceptedChangeBundleDigest,
	parseAcceptedChangeBundle,
	prepareAcceptedChangeBundle,
} from "../../src/changes/accepted-bundle.ts";
import { changeContentDigest } from "../../src/changes/digest.ts";
import { createChangeRecord } from "../../src/changes/records.ts";
import { CHANGE_SCHEMA_VERSION } from "../../src/changes/types.ts";

const NOW = "2026-07-13T04:00:00.000Z";
const HEAD = "1111111111111111111111111111111111111111";
const NEXT_HEAD = "2222222222222222222222222222222222222222";

function validChange(id = "CHG-accepted-boundary") {
	const change = {
		schemaVersion: CHANGE_SCHEMA_VERSION,
		id,
		revision: 1,
		status: "pending",
		intent: {
			question: "Should this exact Change become independent trace work?",
			currentState: "The Change is mutable before Decision.",
			desiredState: "Decision freezes an exact validated revision.",
			rationale: "Trace execution must not depend on mutable latest state.",
			nonGoals: ["Do not create another semantic loop."],
		},
		classification: {
			kind: "introduce",
			type: "workflow_change",
			scope: "system",
			affectedLayers: ["changes", "traces"],
			targetRefs: ["src/changes/accepted-bundle.ts"],
		},
		impact: {
			user: "The main session can continue while trace work executes.",
			maintainer: "Every trace input is reproducible.",
		},
		evidence: {
			sourceRefs: ["kb:system/components/decision-loop.md"],
			proofRefs: ["tests/changes/accepted-bundle.test.mjs"],
		},
		safety: {
			risk: "low",
			failureModes: ["A stale Change could be accepted."],
		},
		validation: {
			state: "draft",
			issues: [],
			assessments: [],
			recommendations: [],
		},
		estimates: { effort: "low", workScale: "small" },
		provenance: {
			origin: "user",
			createdBy: "user",
			createdAt: NOW,
			updatedAt: NOW,
		},
	};
	const digest = changeContentDigest(change);
	change.validation = {
		...change.validation,
		state: "valid",
		validatedRevision: change.revision,
		validatedDigest: digest,
		validatorVersion: "test-v1",
	};
	return change;
}

function selection(record) {
	return {
		changeId: record.change.id,
		revision: record.change.revision,
		recordRevision: record.recordRevision,
		contentDigest: changeContentDigest(record.change),
	};
}

function prepare(snapshot, record, overrides = {}) {
	return prepareAcceptedChangeBundle({
		traceId: "TRACE-accepted-boundary",
		expectedHead: HEAD,
		snapshot,
		selections: [selection(record)],
		acceptedBy: "user@example.test",
		acceptedAt: NOW,
		...overrides,
	});
}

describe("accepted Change bundle", () => {
	it("freezes exact validated snapshots without changing content revision", () => {
		const pending = createChangeRecord(validChange());
		const prepared = prepare({ head: HEAD, records: [pending] }, pending);
		const accepted = prepared.records[0];

		assert.equal(prepared.recoveredAcceptance, false);
		assert.equal(accepted.change.status, "accepted");
		assert.equal(accepted.change.revision, pending.change.revision);
		assert.equal(accepted.recordRevision, pending.recordRevision + 1);
		assert.equal(accepted.change.validation.state, "valid");
		assert.equal(
			accepted.change.lastStatusTransition.contentDigest,
			changeContentDigest(pending.change),
		);
		assert.equal(accepted.change.lastStatusTransition.ref, prepared.bundle.traceId);
		assert.equal(
			prepared.bundle.changes[0].contentDigest,
			changeContentDigest(pending.change),
		);
		assert.equal(
			prepared.bundle.digest,
			acceptedChangeBundleDigest(prepared.bundle),
		);
		assert.deepEqual(parseAcceptedChangeBundle(prepared.bundle), prepared.bundle);
	});

	it("recovers a completed acceptance after a trace append interruption", () => {
		const pending = createChangeRecord(validChange());
		const first = prepare({ head: HEAD, records: [pending] }, pending);
		const recovered = prepare(
			{ head: NEXT_HEAD, records: first.records },
			pending,
		);

		assert.equal(recovered.recoveredAcceptance, true);
		assert.equal(recovered.bundle.digest, first.bundle.digest);
		assert.deepEqual(recovered.records, first.records);
	});

	it("rejects stale, invalid, and tampered acceptance input", () => {
		const pending = createChangeRecord(validChange());
		assert.throws(
			() =>
				prepare(
					{ head: HEAD, records: [pending] },
					pending,
					{ selections: [{ ...selection(pending), revision: 2 }] },
				),
			/stale/,
		);

		const invalid = createChangeRecord({
			...validChange("CHG-invalid"),
			validation: {
				...validChange("CHG-invalid").validation,
				state: "stale",
			},
		});
		assert.throws(
			() => prepare({ head: HEAD, records: [invalid] }, invalid),
			/validation does not bind/,
		);

		const accepted = prepare({ head: HEAD, records: [pending] }, pending).bundle;
		assert.throws(
			() =>
				parseAcceptedChangeBundle({
					...accepted,
					digest: `sha256:${"0".repeat(64)}`,
				}),
			/digest mismatch/,
		);
	});
});
