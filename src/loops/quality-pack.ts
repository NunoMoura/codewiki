import {
	LOOP_QUALITY_GRAPH_SCHEMA_VERSION,
	type LoopQualityGate,
	type LoopQualityGraphNode,
	type LoopQualityJudgeNodeSpec,
	type LoopQualityLayer,
	type LoopQualityRepairTarget,
	type LoopQualityStandardMethod,
	type LoopQualityStandardType,
} from "./graph.ts";

export const LOOP_QUALITY_PACK_SCHEMA_VERSION = 1;

export const LOOP_QUALITY_PACK_AUTHORITIES = [
	"kernel",
	"official",
	"project",
	"lab",
] as const;
export const LOOP_QUALITY_PACK_ROLLOUTS = [
	"observe",
	"warn",
	"enforce",
] as const;
export const LOOP_QUALITY_PACK_GRAPH_IDS = [
	"decision.loop",
	"planning.loop",
	"implementation.loop",
] as const;
export const LOOP_QUALITY_PACK_EVALUATOR_IDS = [
	"issue_codes",
	"agent_assessment",
	"model_judge",
	"human_approval",
	"external_evidence",
] as const;
export const LOOP_QUALITY_PACK_EVIDENCE_ADAPTER_IDS = [
	"trace_refs",
	"check_results",
	"content_proof",
	"review_evidence",
	"approval_refs",
] as const;

const QUALITY_LAYERS = [
	"hard_gate",
	"input_contract",
	"trace_fidelity",
	"coverage",
	"specificity",
	"scope_control",
	"evidence_quality",
	"risk_authority",
	"project_fit",
	"repairability",
	"pipeline_carryover",
	"exit_loss",
] as const satisfies readonly LoopQualityLayer[];
const STANDARD_METHODS = [
	"deterministic",
	"agent_self_assessment",
	"model_judge",
	"human_authority",
	"external_evidence",
] as const satisfies readonly LoopQualityStandardMethod[];
const STANDARD_GATES = [
	"hard",
	"soft",
	"score_only",
] as const satisfies readonly LoopQualityGate[];
const STANDARD_TYPES = [
	"loop_contract",
	"security",
	"maintainability",
	"robustness",
	"project_fit",
	"user_value",
	"scope_control",
	"reversibility",
	"evidence_quality",
	"trace_fidelity",
	"pipeline_carryover",
	"risk_authority",
	"coverage",
	"repairability",
] as const satisfies readonly LoopQualityStandardType[];
const REPAIR_TARGETS = [
	"decision",
	"planning",
	"implementation",
	"kb",
	"source",
	"tests",
	"trace",
	"user",
] as const satisfies readonly LoopQualityRepairTarget[];
const EVALUATOR_FOR_METHOD: Record<
	LoopQualityStandardMethod,
	LoopQualityPackEvaluatorId
> = {
	deterministic: "issue_codes",
	agent_self_assessment: "agent_assessment",
	model_judge: "model_judge",
	human_authority: "human_approval",
	external_evidence: "external_evidence",
};

export type LoopQualityPackAuthority =
	(typeof LOOP_QUALITY_PACK_AUTHORITIES)[number];
export type LoopQualityPackRollout =
	(typeof LOOP_QUALITY_PACK_ROLLOUTS)[number];
export type LoopQualityPackEvaluatorId =
	(typeof LOOP_QUALITY_PACK_EVALUATOR_IDS)[number];
export type LoopQualityPackEvidenceAdapterId =
	(typeof LOOP_QUALITY_PACK_EVIDENCE_ADAPTER_IDS)[number];

export interface LoopQualityPackIssuePredicate {
	kind: "issue_codes";
	match: "any" | "all";
	codes: string[];
}

export interface LoopQualityPackApproval {
	status: "approved";
	refs: string[];
}

export interface LoopQualityPackStandard extends LoopQualityGraphNode<string> {
	evaluatorId: LoopQualityPackEvaluatorId;
	evidenceAdapterIds: LoopQualityPackEvidenceAdapterId[];
	issuePredicate: LoopQualityPackIssuePredicate;
}

export interface LoopQualityPackGraphDeclaration {
	graphId: string;
	graphVersion: string;
	schemaVersion: typeof LOOP_QUALITY_GRAPH_SCHEMA_VERSION;
	layers: LoopQualityLayer[];
}

export interface LoopQualityPack {
	schemaVersion: typeof LOOP_QUALITY_PACK_SCHEMA_VERSION;
	id: string;
	version: string;
	authority: LoopQualityPackAuthority;
	rollout: LoopQualityPackRollout;
	approval?: LoopQualityPackApproval;
	graph: LoopQualityPackGraphDeclaration;
	standards: LoopQualityPackStandard[];
}

export interface ParseLoopQualityPackOptions {
	protectedKernelStandardIds?: readonly string[];
}

export function parseLoopQualityPack(
	value: unknown,
	options: ParseLoopQualityPackOptions = {},
): LoopQualityPack {
	const input = objectAt(value, "qualityPack");
	assertKnownKeys(input, "", [
		"schemaVersion",
		"id",
		"version",
		"authority",
		"rollout",
		"approval",
		"graph",
		"standards",
	]);
	const schemaVersion = numberAt(input.schemaVersion, "schemaVersion");
	if (schemaVersion !== LOOP_QUALITY_PACK_SCHEMA_VERSION) {
		fail(
			"schemaVersion",
			`uses unsupported value ${schemaVersion}; expected ${LOOP_QUALITY_PACK_SCHEMA_VERSION}`,
		);
	}
	const id = stableIdAt(input.id, "id");
	const version = textAt(input.version, "version");
	const authority = enumAt(
		input.authority,
		"authority",
		LOOP_QUALITY_PACK_AUTHORITIES,
	);
	const rollout = enumAt(input.rollout, "rollout", LOOP_QUALITY_PACK_ROLLOUTS);
	const approval = optionalApproval(input.approval);
	assertRolloutAuthority(id, authority, rollout, approval);
	const graph = parseGraph(input.graph);
	const standards = arrayAt(input.standards, "standards").map(
		(standard, index) => parseStandard(standard, index),
	);
	if (standards.length === 0)
		fail("standards", "must contain at least one standard");
	validateStandards(standards, graph, authority, options);
	return {
		schemaVersion: LOOP_QUALITY_PACK_SCHEMA_VERSION,
		id,
		version,
		authority,
		rollout,
		...(approval ? { approval } : {}),
		graph,
		standards,
	};
}

function parseGraph(value: unknown): LoopQualityPackGraphDeclaration {
	const graph = objectAt(value, "graph");
	assertKnownKeys(graph, "graph", ["id", "version", "layers"]);
	const layers = arrayAt(graph.layers, "graph.layers").map((layer, index) =>
		enumAt(layer, `graph.layers[${index}]`, QUALITY_LAYERS),
	);
	assertUnique(layers, "graph.layers");
	if (layers.length === 0)
		fail("graph.layers", "must contain at least one layer");
	return {
		graphId: enumAt(graph.id, "graph.id", LOOP_QUALITY_PACK_GRAPH_IDS),
		graphVersion: textAt(graph.version, "graph.version"),
		schemaVersion: LOOP_QUALITY_GRAPH_SCHEMA_VERSION,
		layers,
	};
}

function parseStandard(value: unknown, index: number): LoopQualityPackStandard {
	const path = `standards[${index}]`;
	const standard = objectAt(value, path);
	assertKnownKeys(standard, path, [
		"id",
		"description",
		"layer",
		"standardType",
		"method",
		"repairTarget",
		"weight",
		"cost",
		"gate",
		"timeoutMs",
		"dependsOn",
		"evaluatorId",
		"evidenceAdapterIds",
		"issuePredicate",
		"scoreThreshold",
		"judge",
	]);
	const method = enumAt(standard.method, `${path}.method`, STANDARD_METHODS);
	const evaluatorId = enumAt(
		standard.evaluatorId,
		`${path}.evaluatorId`,
		LOOP_QUALITY_PACK_EVALUATOR_IDS,
	);
	if (EVALUATOR_FOR_METHOD[method] !== evaluatorId) {
		fail(
			`${path}.evaluatorId`,
			`${evaluatorId} is incompatible with method ${method}`,
		);
	}
	const issuePredicate = parseIssuePredicate(
		standard.issuePredicate,
		`${path}.issuePredicate`,
	);
	const scoreThreshold = optionalScore(
		standard.scoreThreshold,
		`${path}.scoreThreshold`,
	);
	const judge = optionalJudge(standard.judge, `${path}.judge`, method);
	return {
		id: stableIdAt(standard.id, `${path}.id`),
		description: textAt(standard.description, `${path}.description`),
		codes: [...issuePredicate.codes],
		layer: enumAt(standard.layer, `${path}.layer`, QUALITY_LAYERS),
		standardType: enumAt(
			standard.standardType,
			`${path}.standardType`,
			STANDARD_TYPES,
		),
		method,
		repairTarget: enumAt(
			standard.repairTarget,
			`${path}.repairTarget`,
			REPAIR_TARGETS,
		),
		weight: nonNegativeNumberAt(standard.weight, `${path}.weight`),
		cost: nonNegativeNumberAt(standard.cost, `${path}.cost`),
		gate: enumAt(standard.gate, `${path}.gate`, STANDARD_GATES),
		timeoutMs: positiveNumberAt(standard.timeoutMs, `${path}.timeoutMs`),
		dependsOn: stringArrayAt(standard.dependsOn, `${path}.dependsOn`, true),
		evaluatorId,
		evidenceAdapterIds: enumArrayAt(
			standard.evidenceAdapterIds,
			`${path}.evidenceAdapterIds`,
			LOOP_QUALITY_PACK_EVIDENCE_ADAPTER_IDS,
		),
		issuePredicate,
		...(scoreThreshold === undefined ? {} : { scoreThreshold }),
		...(judge ? { judge } : {}),
	};
}

function parseIssuePredicate(
	value: unknown,
	path: string,
): LoopQualityPackIssuePredicate {
	const predicate = objectAt(value, path);
	assertKnownKeys(predicate, path, ["kind", "match", "codes"]);
	const codes = stringArrayAt(predicate.codes, `${path}.codes`, false);
	return {
		kind: enumAt(predicate.kind, `${path}.kind`, ["issue_codes"] as const),
		match: enumAt(predicate.match, `${path}.match`, ["any", "all"] as const),
		codes,
	};
}

function optionalApproval(value: unknown): LoopQualityPackApproval | undefined {
	if (value === undefined) return undefined;
	const approval = objectAt(value, "approval");
	assertKnownKeys(approval, "approval", ["status", "refs"]);
	return {
		status: enumAt(approval.status, "approval.status", ["approved"] as const),
		refs: stringArrayAt(approval.refs, "approval.refs", false),
	};
}

function optionalJudge(
	value: unknown,
	path: string,
	method: LoopQualityStandardMethod,
): LoopQualityJudgeNodeSpec | undefined {
	const usesJudge =
		method === "agent_self_assessment" || method === "model_judge";
	if (value === undefined) {
		if (usesJudge) fail(path, `is required for method ${method}`);
		return undefined;
	}
	if (!usesJudge) fail(path, `is not allowed for method ${method}`);
	const judge = objectAt(value, path);
	assertKnownKeys(judge, path, [
		"id",
		"role",
		"rubric",
		"scoreThreshold",
		"calibrationRefs",
	]);
	return {
		id: stableIdAt(judge.id, `${path}.id`),
		role: textAt(judge.role, `${path}.role`),
		rubric: stringArrayAt(judge.rubric, `${path}.rubric`, false),
		scoreThreshold: scoreAt(judge.scoreThreshold, `${path}.scoreThreshold`),
		...(judge.calibrationRefs === undefined
			? {}
			: {
					calibrationRefs: stringArrayAt(
						judge.calibrationRefs,
						`${path}.calibrationRefs`,
						true,
					),
				}),
	};
}

function validateStandards(
	standards: LoopQualityPackStandard[],
	graph: LoopQualityPackGraphDeclaration,
	authority: LoopQualityPackAuthority,
	options: ParseLoopQualityPackOptions,
): void {
	const declaredLayers = new Set(graph.layers);
	const ids = new Set<string>();
	const protectedKernelIds = new Set(options.protectedKernelStandardIds || []);
	for (const [index, standard] of standards.entries()) {
		const path = `standards[${index}]`;
		if (ids.has(standard.id)) fail(`${path}.id`, `duplicates ${standard.id}`);
		ids.add(standard.id);
		if (!declaredLayers.has(standard.layer)) {
			fail(`${path}.layer`, `uses undeclared layer ${standard.layer}`);
		}
		if (authority !== "kernel" && protectedKernelIds.has(standard.id)) {
			fail(`${path}.id`, `cannot override kernel standard ${standard.id}`);
		}
		assertUnique(standard.dependsOn || [], `${path}.dependsOn`);
	}
	for (const [index, standard] of standards.entries()) {
		for (const [dependencyIndex, dependency] of (
			standard.dependsOn || []
		).entries()) {
			if (!ids.has(dependency)) {
				fail(
					`standards[${index}].dependsOn[${dependencyIndex}]`,
					`references unknown standard ${dependency}`,
				);
			}
			if (dependency === standard.id) {
				fail(
					`standards[${index}].dependsOn[${dependencyIndex}]`,
					`cannot reference itself`,
				);
			}
		}
	}
	assertAcyclicStandards(standards);
}

function assertAcyclicStandards(standards: LoopQualityPackStandard[]): void {
	const byId = new Map(standards.map((standard) => [standard.id, standard]));
	const visiting = new Set<string>();
	const visited = new Set<string>();
	const visit = (id: string): void => {
		if (visited.has(id)) return;
		if (visiting.has(id)) fail("standards", `dependency cycle at ${id}`);
		visiting.add(id);
		for (const dependency of byId.get(id)?.dependsOn || []) visit(dependency);
		visiting.delete(id);
		visited.add(id);
	};
	for (const standard of standards) visit(standard.id);
}

function assertRolloutAuthority(
	id: string,
	authority: LoopQualityPackAuthority,
	rollout: LoopQualityPackRollout,
	approval: LoopQualityPackApproval | undefined,
): void {
	if (rollout !== "enforce") return;
	if (authority === "lab") fail("rollout", `lab pack ${id} cannot enforce`);
	if (authority === "project" && !approval) {
		fail("approval", `is required before project pack ${id} can enforce`);
	}
}

function objectAt(value: unknown, path: string): Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		fail(path, "must be an object");
	}
	return value as Record<string, unknown>;
}

function arrayAt(value: unknown, path: string): unknown[] {
	if (!Array.isArray(value)) fail(path, "must be an array");
	return value;
}

function textAt(value: unknown, path: string): string {
	if (typeof value !== "string" || !value.trim())
		fail(path, "must be a non-empty string");
	return value.trim();
}

function stableIdAt(value: unknown, path: string): string {
	const id = textAt(value, path);
	if (!/^[a-z][a-z0-9._-]*$/i.test(id)) {
		fail(path, `has invalid stable id ${id}`);
	}
	return id;
}

function numberAt(value: unknown, path: string): number {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		fail(path, "must be a finite number");
	}
	return value;
}

function nonNegativeNumberAt(value: unknown, path: string): number {
	const number = numberAt(value, path);
	if (number < 0) fail(path, "must be zero or greater");
	return number;
}

function positiveNumberAt(value: unknown, path: string): number {
	const number = numberAt(value, path);
	if (number <= 0) fail(path, "must be greater than zero");
	return number;
}

function scoreAt(value: unknown, path: string): number {
	const score = numberAt(value, path);
	if (score < 0 || score > 100) fail(path, "must be between 0 and 100");
	return score;
}

function optionalScore(value: unknown, path: string): number | undefined {
	return value === undefined ? undefined : scoreAt(value, path);
}

function enumAt<const T extends readonly string[]>(
	value: unknown,
	path: string,
	allowed: T,
): T[number] {
	if (typeof value !== "string" || !allowed.includes(value)) {
		fail(path, `has unsupported value ${String(value)}`);
	}
	return value as T[number];
}

function stringArrayAt(
	value: unknown,
	path: string,
	allowEmpty: boolean,
): string[] {
	const values = arrayAt(value, path).map((entry, index) =>
		textAt(entry, `${path}[${index}]`),
	);
	if (!allowEmpty && values.length === 0) fail(path, "must not be empty");
	assertUnique(values, path);
	return values;
}

function enumArrayAt<const T extends readonly string[]>(
	value: unknown,
	path: string,
	allowed: T,
): T[number][] {
	const values = arrayAt(value, path).map((entry, index) =>
		enumAt(entry, `${path}[${index}]`, allowed),
	);
	assertUnique(values, path);
	return values;
}

function assertKnownKeys(
	value: Record<string, unknown>,
	path: string,
	allowed: readonly string[],
): void {
	const known = new Set(allowed);
	for (const key of Object.keys(value)) {
		if (!known.has(key)) fail(path ? `${path}.${key}` : key, "has unknown key");
	}
}

function assertUnique(values: readonly string[], path: string): void {
	const seen = new Set<string>();
	for (const [index, value] of values.entries()) {
		if (seen.has(value)) fail(`${path}[${index}]`, `duplicates ${value}`);
		seen.add(value);
	}
}

function fail(path: string, message: string): never {
	throw new Error(`${path || "qualityPack"} ${message}.`);
}
