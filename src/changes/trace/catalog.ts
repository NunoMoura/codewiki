import {
	CHANGE_OPERATION_KINDS,
	changeOperationPayloadSchemas,
	type AuthorityCapability,
	type ChangeOperationKind,
	type ChangeTraceOperationKind,
} from "./contracts.ts";

export type ParentPolicy =
	| {readonly kind: "root"; readonly count: 0}
	| {readonly kind: "tail"; readonly count: 1}
	| {readonly kind: "causal_merge"; readonly minimum: 1; readonly maximum: 64};

export type ConflictBehavior =
	| "reject"
	| "retain_contradiction"
	| "require_atomic_batch"
	| "record_observation";

export type SupersessionBehavior =
	| "never"
	| "explicit"
	| "latest_valid"
	| "terminal"
	| "append_history";

export interface OperationDefinition {
	readonly kind: ChangeTraceOperationKind;
	readonly scope: "change" | "project";
	readonly kindVersion: "1.0.0";
	readonly capability: AuthorityCapability;
	readonly parentPolicy: ParentPolicy | null;
	readonly precondition: string;
	readonly reduction: ChangeTraceOperationKind;
	readonly conflictBehavior: ConflictBehavior;
	readonly graphProjection: readonly string[];
	readonly supersession: SupersessionBehavior;
}

const ROOT = Object.freeze({kind: "root", count: 0} as const);
const TAIL = Object.freeze({kind: "tail", count: 1} as const);
const CAUSAL_MERGE = Object.freeze({
	kind: "causal_merge",
	minimum: 1,
	maximum: 64,
} as const);

type DefinitionInput = readonly [
	kind: ChangeOperationKind,
	capability: AuthorityCapability,
	parentPolicy: ParentPolicy,
	precondition: string,
	conflictBehavior: ConflictBehavior,
	graphProjection: readonly string[],
	supersession: SupersessionBehavior,
];

function definition([
	kind,
	capability,
	parentPolicy,
	precondition,
	conflictBehavior,
	graphProjection,
	supersession,
]: DefinitionInput): OperationDefinition {
	return Object.freeze({
		kind,
		scope: "change",
		kindVersion: "1.0.0",
		capability,
		parentPolicy,
		precondition,
		reduction: kind,
		conflictBehavior,
		graphProjection: Object.freeze([...graphProjection]),
		supersession,
	});
}

export const OPERATION_DEFINITIONS: Readonly<
	Record<ChangeTraceOperationKind, OperationDefinition>
> = Object.freeze({
	"trace.opened": definition([
		"trace.opened",
		"trace.lifecycle",
		ROOT,
		"no hot or archived active segment exists",
		"reject",
		["change_has_trace_root"],
		"never",
	]),
	"trace.closed": definition([
		"trace.closed",
		"trace.lifecycle",
		TAIL,
		"trace is open and terminal obligations are satisfied",
		"reject",
		["trace_closed_by"],
		"terminal",
	]),
	"trace.reopened": definition([
		"trace.reopened",
		"trace.lifecycle",
		ROOT,
		"referenced archived closure and tail verify",
		"reject",
		["trace_reopens_archive", "trace_continues_from"],
		"never",
	]),
	"change.proposed": definition([
		"change.proposed",
		"change.intent",
		TAIL,
		"trace is open and has no accepted revision",
		"reject",
		["change_has_revision", "revision_has_requirement"],
		"latest_valid",
	]),
	"change.revised": definition([
		"change.revised",
		"change.intent",
		TAIL,
		"previous revision is current and trace is open",
		"reject",
		["change_has_revision", "revision_supersedes_revision"],
		"latest_valid",
	]),
	"change.relationship_recorded": definition([
		"change.relationship_recorded",
		"change.relationship",
		TAIL,
		"source revision is current and target revision is exact",
		"retain_contradiction",
		["change_relationship"],
		"explicit",
	]),
	"change.relationship_superseded": definition([
		"change.relationship_superseded",
		"change.relationship",
		TAIL,
		"referenced active relationship exists",
		"reject",
		["relationship_superseded_by"],
		"never",
	]),
	"change.merge_recorded": definition([
		"change.merge_recorded",
		"change.relationship",
		CAUSAL_MERGE,
		"all source and result bindings are exact in one accepted batch",
		"require_atomic_batch",
		["change_merged_into"],
		"append_history",
	]),
	"change.split_recorded": definition([
		"change.split_recorded",
		"change.relationship",
		TAIL,
		"source and all result bindings are exact in one accepted batch",
		"require_atomic_batch",
		["change_split_into"],
		"append_history",
	]),
	"change.withdrawal_recorded": definition([
		"change.withdrawal_recorded",
		"change.intent",
		TAIL,
		"revision is current and trace is open",
		"reject",
		["change_withdrawn_by"],
		"terminal",
	]),
	"change.feedback_recorded": definition([
		"change.feedback_recorded",
		"change.feedback",
		TAIL,
		"referenced revision exists",
		"retain_contradiction",
		["feedback_about_revision"],
		"append_history",
	]),
	"change_claim.acquired": definition([
		"change_claim.acquired",
		"change_claim.manage",
		TAIL,
		"revision is current and no Change Claim is active",
		"reject",
		["actor_claims_change"],
		"explicit",
	]),
	"change_claim.released": definition([
		"change_claim.released",
		"change_claim.manage",
		TAIL,
		"referenced Change Claim is active",
		"reject",
		["claim_released_by"],
		"never",
	]),
	"change_claim.takeover_recorded": definition([
		"change_claim.takeover_recorded",
		"change_claim.manage",
		TAIL,
		"prior Change Claim is active and authority is authenticated",
		"reject",
		["claim_taken_over_by"],
		"explicit",
	]),
	"loop.attempt_started": definition([
		"loop.attempt_started",
		"loop.record",
		TAIL,
		"revision is current and no same-Loop attempt is active",
		"reject",
		["change_has_loop_attempt"],
		"explicit",
	]),
	"loop.attempt_ended": definition([
		"loop.attempt_ended",
		"loop.record",
		TAIL,
		"referenced Loop attempt is active",
		"reject",
		["attempt_ended_by"],
		"terminal",
	]),
	"decision.candidate_recorded": definition([
		"decision.candidate_recorded",
		"loop.record",
		TAIL,
		"referenced active attempt is Decision",
		"reject",
		["attempt_has_candidate"],
		"latest_valid",
	]),
	"planning.candidate_recorded": definition([
		"planning.candidate_recorded",
		"loop.record",
		TAIL,
		"referenced active attempt is Planning",
		"reject",
		["attempt_has_candidate"],
		"latest_valid",
	]),
	"implementation.candidate_recorded": definition([
		"implementation.candidate_recorded",
		"loop.record",
		TAIL,
		"referenced active attempt is Implementation",
		"reject",
		["attempt_has_candidate"],
		"latest_valid",
	]),
	"loop.exit_policy_recorded": definition([
		"loop.exit_policy_recorded",
		"loop.record",
		TAIL,
		"policy binds current Candidate and active attempt",
		"reject",
		["candidate_has_exit_policy"],
		"latest_valid",
	]),
	"evidence.recorded": definition([
		"evidence.recorded",
		"loop.record",
		TAIL,
		"evidence subject binds active attempt and optional Candidate",
		"retain_contradiction",
		["candidate_has_evidence", "attempt_has_evidence"],
		"append_history",
	]),
	"check.result_recorded": definition([
		"check.result_recorded",
		"loop.record",
		TAIL,
		"Result binds current Candidate, policy, and exact considered Evidence",
		"retain_contradiction",
		["candidate_has_check_result", "check_result_considered_evidence"],
		"latest_valid",
	]),
	"loop.exit_report_recorded": definition([
		"loop.exit_report_recorded",
		"loop.record",
		TAIL,
		"Report binds complete required Result fan-in",
		"reject",
		["candidate_has_exit_report", "exit_report_has_result"],
		"latest_valid",
	]),
	"runtime.route_recorded": definition([
		"runtime.route_recorded",
		"loop.record",
		TAIL,
		"route binds current Exit Report and fresh authority/base",
		"reject",
		["exit_report_routes_to"],
		"latest_valid",
	]),
	"work_unit_claim.acquired": definition([
		"work_unit_claim.acquired",
		"work_unit_claim.manage",
		TAIL,
		"Work Unit is on fresh safe frontier and has no active Work Unit Claim",
		"reject",
		["worker_claims_work_unit"],
		"explicit",
	]),
	"work_unit_claim.released": definition([
		"work_unit_claim.released",
		"work_unit_claim.manage",
		TAIL,
		"referenced Work Unit Claim is active",
		"reject",
		["work_unit_claim_released_by"],
		"never",
	]),
	"work_unit_claim.takeover_recorded": definition([
		"work_unit_claim.takeover_recorded",
		"work_unit_claim.manage",
		TAIL,
		"prior Work Unit Claim is active and authority is authenticated",
		"reject",
		["work_unit_claim_taken_over_by"],
		"explicit",
	]),
	"assignment.dispatched": definition([
		"assignment.dispatched",
		"assignment.manage",
		TAIL,
		"referenced Work Unit Claim is active and exact",
		"reject",
		["work_unit_dispatched_as_assignment"],
		"explicit",
	]),
	"assignment.cancel_requested": definition([
		"assignment.cancel_requested",
		"assignment.manage",
		TAIL,
		"referenced Assignment is active",
		"record_observation",
		["assignment_has_cancel_request"],
		"append_history",
	]),
	"assignment.terminal_recorded": definition([
		"assignment.terminal_recorded",
		"assignment.manage",
		TAIL,
		"referenced Assignment is active",
		"reject",
		["assignment_ended_by"],
		"terminal",
	]),
	"worker.report_recorded": definition([
		"worker.report_recorded",
		"assignment.manage",
		TAIL,
		"Assignment and Work Unit Claim bindings are exact",
		"retain_contradiction",
		["assignment_has_worker_report"],
		"append_history",
	]),
	"integration.attempt_started": definition([
		"integration.attempt_started",
		"integration.record",
		TAIL,
		"Assignments are terminal and exact candidate sources exist",
		"reject",
		["change_has_integration_attempt", "integration_uses_assignment"],
		"explicit",
	]),
	"integration.result_recorded": definition([
		"integration.result_recorded",
		"integration.record",
		TAIL,
		"referenced Integration attempt is active",
		"retain_contradiction",
		["integration_attempt_has_result"],
		"terminal",
	]),
	"source.branch_merge_recorded": definition([
		"source.branch_merge_recorded",
		"source.effect",
		TAIL,
		"successful exact Integration result exists and effect is authorized",
		"record_observation",
		["integration_merged_commit"],
		"append_history",
	]),
	"source.branch_push_recorded": definition([
		"source.branch_push_recorded",
		"source.effect",
		TAIL,
		"expected remote head matched and authenticated receipt exists",
		"record_observation",
		["commit_pushed_to_ref"],
		"append_history",
	]),
	"review_projection.published": definition([
		"review_projection.published",
		"review.publish",
		TAIL,
		"review projection binds exact Candidate, tree, and authorized provider receipt",
		"record_observation",
		["candidate_published_for_review"],
		"append_history",
	]),
	"product.publication_recorded": definition([
		"product.publication_recorded",
		"product.effect",
		TAIL,
		"publication effect is separately authorized and receipt-bound",
		"record_observation",
		["candidate_published_as_product"],
		"append_history",
	]),
	"product.release_recorded": definition([
		"product.release_recorded",
		"product.effect",
		TAIL,
		"release effect is separately authorized and receipt-bound",
		"record_observation",
		["artifact_released_through_channel"],
		"append_history",
	]),
	"delivery.observation_recorded": definition([
		"delivery.observation_recorded",
		"product.effect",
		TAIL,
		"delivery Evidence binds exact authorized effect",
		"retain_contradiction",
		["effect_has_delivery_observation"],
		"append_history",
	]),
	"outcome.observation_recorded": definition([
		"outcome.observation_recorded",
		"outcome.observe",
		TAIL,
		"outcome Evidence binds exact Change or delivery",
		"retain_contradiction",
		["change_has_outcome", "delivery_has_outcome"],
		"append_history",
	]),
});

for (const kind of CHANGE_OPERATION_KINDS) {
	if (OPERATION_DEFINITIONS[kind].kind !== kind) {
		throw new Error(`Change operation definition key mismatch for ${kind}.`);
	}
	if (!changeOperationPayloadSchemas[kind]) {
		throw new Error(`Change operation ${kind} has no payload schema.`);
	}
}
