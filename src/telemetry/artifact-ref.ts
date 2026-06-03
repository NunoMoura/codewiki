import { unique } from "../shared/utils.ts";

export const TELEMETRY_TRACE_LOOP_VALUES = [
	"decision",
	"planning",
	"implementation",
] as const;

export const ARTIFACT_REF_KIND_VALUES = [
	"decision_trace",
	"planning_trace",
	"implementation_trace",
	"gate_report",
	"git_commit",
	"git_tree",
	"package_digest",
	"archive_ref",
	"remote_ref",
	"content_digest",
	"roadmap_task",
	"source",
	"unknown",
] as const;

export type TelemetryTraceLoop = (typeof TELEMETRY_TRACE_LOOP_VALUES)[number];
export type ArtifactRefKind = (typeof ARTIFACT_REF_KIND_VALUES)[number];

export interface ArtifactRef {
	kind: ArtifactRefKind;
	ref: string;
	source_field?: string;
	legacy?: boolean;
}

export interface ArtifactRefSetInput {
	canonical_refs?: unknown;
	build_refs?: unknown;
	validation_refs?: unknown;
	content_refs?: unknown;
	trace_refs?: unknown;
	gate_refs?: unknown;
	git_refs?: unknown;
	legacy_loop?: unknown;
}

export interface ArtifactRefSets {
	trace_refs: string[];
	gate_refs: string[];
	git_refs: string[];
	artifact_refs: ArtifactRef[];
}

function trimString(value: unknown): string {
	return String(value ?? "").trim();
}

export function normalizeArtifactRefList(values: unknown): string[] {
	return unique(
		(Array.isArray(values) ? values : values ? [values] : [])
			.map(trimString)
			.filter(Boolean),
	);
}

function artifactRef(
	kind: ArtifactRefKind,
	ref: string,
	source_field: string,
	legacy = false,
): ArtifactRef {
	return { kind, ref, source_field, ...(legacy ? { legacy: true } : {}) };
}

function pushRefs(input: {
	refs: string[];
	kind: ArtifactRefKind;
	source_field: string;
	legacy?: boolean;
	target: string[];
	artifactRefs: ArtifactRef[];
}) {
	for (const ref of input.refs) {
		input.target.push(ref);
		input.artifactRefs.push(
			artifactRef(input.kind, ref, input.source_field, input.legacy),
		);
	}
}

function legacyGateRefsForLoop(value: unknown): string[] {
	const loop = trimString(value).toLowerCase().replace(/_/g, "-");
	if (!loop) return [];
	if (
		["validation", "task-close", "publication", "publish", "release"].includes(
			loop,
		)
	) {
		return [`gate:${loop}`];
	}
	return [];
}

export function normalizeArtifactRefSets(
	input: ArtifactRefSetInput = {},
): ArtifactRefSets {
	const canonical: Record<string, unknown> =
		input.canonical_refs && typeof input.canonical_refs === "object"
			? (input.canonical_refs as Record<string, unknown>)
			: {};
	const artifactRefs: ArtifactRef[] = [];
	const traceRefs: string[] = [];
	const gateRefs: string[] = [];
	const gitRefs: string[] = [];

	pushRefs({
		refs: normalizeArtifactRefList(input.trace_refs),
		kind: "source",
		source_field: "trace_refs",
		target: traceRefs,
		artifactRefs,
	});
	pushRefs({
		refs: normalizeArtifactRefList(input.gate_refs),
		kind: "gate_report",
		source_field: "gate_refs",
		target: gateRefs,
		artifactRefs,
	});
	pushRefs({
		refs: normalizeArtifactRefList(input.git_refs),
		kind: "content_digest",
		source_field: "git_refs",
		target: gitRefs,
		artifactRefs,
	});
	pushRefs({
		refs: normalizeArtifactRefList(input.build_refs),
		kind: "implementation_trace",
		source_field: "build_refs",
		legacy: true,
		target: traceRefs,
		artifactRefs,
	});
	pushRefs({
		refs: normalizeArtifactRefList(input.validation_refs),
		kind: "gate_report",
		source_field: "validation_refs",
		legacy: true,
		target: gateRefs,
		artifactRefs,
	});
	pushRefs({
		refs: normalizeArtifactRefList(input.content_refs),
		kind: "content_digest",
		source_field: "content_refs",
		legacy: true,
		target: gitRefs,
		artifactRefs,
	});
	pushRefs({
		refs: normalizeArtifactRefList(canonical.decision_build),
		kind: "decision_trace",
		source_field: "canonical_refs.decision_build",
		target: traceRefs,
		artifactRefs,
	});
	pushRefs({
		refs: normalizeArtifactRefList(canonical.planning_build),
		kind: "planning_trace",
		source_field: "canonical_refs.planning_build",
		target: traceRefs,
		artifactRefs,
	});
	pushRefs({
		refs: normalizeArtifactRefList(canonical.implementation_build),
		kind: "implementation_trace",
		source_field: "canonical_refs.implementation_build",
		target: traceRefs,
		artifactRefs,
	});
	pushRefs({
		refs: normalizeArtifactRefList(canonical.validation_report),
		kind: "gate_report",
		source_field: "canonical_refs.validation_report",
		target: gateRefs,
		artifactRefs,
	});
	pushRefs({
		refs: legacyGateRefsForLoop(input.legacy_loop),
		kind: "gate_report",
		source_field: "legacy_loop",
		legacy: true,
		target: gateRefs,
		artifactRefs,
	});
	for (const [field, kind] of [
		["git_commit", "git_commit"],
		["git_tree", "git_tree"],
		["package_digest", "package_digest"],
		["archive_ref", "archive_ref"],
		["remote_ref", "remote_ref"],
	] as const) {
		pushRefs({
			refs: normalizeArtifactRefList(canonical[field]),
			kind,
			source_field: `canonical_refs.${field}`,
			target: gitRefs,
			artifactRefs,
		});
	}

	return {
		trace_refs: unique(traceRefs),
		gate_refs: unique(gateRefs),
		git_refs: unique(gitRefs),
		artifact_refs: artifactRefs.filter(
			(ref, index, refs) =>
				refs.findIndex(
					(item) =>
						item.kind === ref.kind &&
						item.ref === ref.ref &&
						item.source_field === ref.source_field,
				) === index,
		),
	};
}
