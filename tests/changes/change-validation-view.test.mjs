import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildChangeValidationCard } from "../../src/changes/validation-view.ts";
import { changeContentDigest } from "../../src/changes/digest.ts";
import { createChangeRecord } from "../../src/changes/records.ts";
import { acceptedChangeFixture } from "../helpers/accepted-change.mjs";

function validationRecord(overrides = {}) {
	const change = acceptedChangeFixture({
		id: "CHG-validation-card",
		currentState:
			overrides.currentState ||
			"Operators cannot compare exact Change revisions.",
		desiredState:
			overrides.desiredState ||
			"Operators see one bounded card for an exact Change revision.",
		rationale: "Shared projections prevent Pi and dashboard drift.",
	});
	change.validation = {
		...change.validation,
		issues: [
			{
				code: "review_scope",
				severity: "warning",
				message: "Confirm the presentation scope.",
				refs: ["src/changes/validation-view.ts"],
			},
		],
		assessments: [
			{
				actor: "CodeWiki agent",
				stance: "aligned",
				rationale: "One projection keeps semantics consistent.",
				concerns: ["Acceptance must remain separate from validation."],
				evidenceRefs: ["tests/changes/change-validation-view.test.mjs"],
			},
		],
		recommendations: [
			{
				actor: "CodeWiki agent",
				value: "accept",
				rationale: "The bounded card preserves exact identity.",
				evidenceRefs: ["tests/changes/change-validation-view.test.mjs"],
			},
		],
	};
	return createChangeRecord(change);
}

describe("Change validation card projection", () => {
	it("preserves semantic sections and independent exact identity", () => {
		const record = validationRecord();
		const card = buildChangeValidationCard(record);

		assert.deepEqual(card.identity, {
			changeId: record.change.id,
			revision: 1,
			recordRevision: 1,
			contentDigest: changeContentDigest(record.change),
			status: "pending",
			validationState: "valid",
		});
		assert.equal(
			card.sections.currentState.text,
			"Operators cannot compare exact Change revisions.",
		);
		assert.equal(
			card.sections.proposedChange.text,
			"Operators see one bounded card for an exact Change revision.",
		);
		assert.equal(card.sections.agentOpinion.assessments[0].stance, "aligned");
		assert.equal(card.sections.agentOpinion.recommendations[0].value, "accept");
		assert.deepEqual(card.sections.agentOpinion.concerns, [
			"Acceptance must remain separate from validation.",
		]);
		assert.equal(card.acceptance, undefined);
	});

	it("rejects stale identity and oversized or control-character content", () => {
		const record = validationRecord();
		assert.throws(
			() => buildChangeValidationCard(record, { expectedRecordRevision: 2 }),
			/stale Change record revision/,
		);
		assert.throws(
			() =>
				buildChangeValidationCard(record, {
					expectedDigest: "sha256:" + "0".repeat(64),
				}),
			/stale Change content digest/,
		);
		const oversized = validationRecord({ currentState: "x".repeat(4_001) });
		assert.throws(
			() => buildChangeValidationCard(oversized),
			/exceeds 4000 characters/,
		);
		assert.throws(
			() =>
				buildChangeValidationCard(
					validationRecord({ currentState: "unsafe\u0000text" }),
				),
			/unsafe control characters/,
		);
	});

	it("redacts secret-looking values before returning renderable data", () => {
		const secret = "sk-live-secret-value-123456789";
		const card = buildChangeValidationCard(
			validationRecord({
				desiredState: `Call service with api_key=${secret} and continue.`,
			}),
		);
		const serialized = JSON.stringify(card);
		assert.equal(serialized.includes(secret), false);
		assert.match(card.sections.proposedChange.text, /api_key=\[REDACTED\]/);
		assert.deepEqual(card.redactions, ["secret-like value"]);
	});
});
