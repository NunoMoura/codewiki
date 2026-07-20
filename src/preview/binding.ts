import type { TraceRecord } from "../traces/types.ts";

export type PreviewBindingActivation = "implementation";
export type PreviewBindingAutoOpen = "once_per_trace" | "manual";
export type PreviewEvidenceViewport = "desktop" | "mobile";

export interface PreviewBindingInput {
	profileId?: string;
	profileDigest?: string;
	required?: boolean;
	activation?: PreviewBindingActivation | string;
	autoOpen?: PreviewBindingAutoOpen | string;
	evidenceViewports?: string[];
}

export interface PreviewBinding {
	profileId: string;
	profileDigest: string;
	required: boolean;
	activation: PreviewBindingActivation;
	autoOpen: PreviewBindingAutoOpen;
	evidenceViewports: PreviewEvidenceViewport[];
}

export interface TracePreviewBinding extends PreviewBinding {
	traceId: string;
}

export function normalizePreviewBinding(
	input: PreviewBindingInput,
): PreviewBinding {
	return {
		profileId: text(input.profileId),
		profileDigest: text(input.profileDigest),
		required: input.required === undefined ? true : (input.required as boolean),
		activation:
			input.activation === undefined
				? "implementation"
				: (input.activation as PreviewBindingActivation),
		autoOpen:
			input.autoOpen === undefined
				? "once_per_trace"
				: (input.autoOpen as PreviewBindingAutoOpen),
		evidenceViewports: normalizeEvidenceViewports(
			input.evidenceViewports,
		) as PreviewEvidenceViewport[],
	};
}

export function previewBindingValidationIssues(
	binding: PreviewBinding,
): string[] {
	const issues: string[] = [];
	if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/.test(binding.profileId)) {
		issues.push("Preview profileId must be a bounded safe identifier.");
	}
	if (!/^sha256:[a-f0-9]{64}$/.test(binding.profileDigest)) {
		issues.push("Preview profileDigest must be an exact sha256 digest.");
	}
	if (typeof binding.required !== "boolean") {
		issues.push("Preview required must be boolean.");
	}
	if (binding.activation !== "implementation") {
		issues.push("Preview activation must be implementation.");
	}
	if (binding.autoOpen !== "once_per_trace" && binding.autoOpen !== "manual") {
		issues.push("Preview autoOpen must be once_per_trace or manual.");
	}
	if (
		binding.evidenceViewports.length === 0 ||
		binding.evidenceViewports.some(
			(viewport) => viewport !== "desktop" && viewport !== "mobile",
		)
	) {
		issues.push(
			"Preview evidenceViewports must contain only desktop or mobile.",
		);
	}
	return issues;
}

export function tracePreviewBindings(
	records: TraceRecord[],
): TracePreviewBinding[] {
	const byTrace = new Map<string, TracePreviewBinding>();
	for (const record of records) {
		if (record.type !== "trace_event" || record.loop !== "planning") continue;
		const output = objectRecord(record.data?.output);
		for (const sprint of objectList(output?.sprints)) {
			const preview = objectRecord(sprint.preview);
			if (!preview) continue;
			const binding = normalizePreviewBinding({
				profileId: text(preview.profileId),
				profileDigest: text(preview.profileDigest),
				required: boolean(preview.required),
				activation: text(preview.activation),
				autoOpen: text(preview.autoOpen),
				evidenceViewports: stringList(preview.evidenceViewports),
			});
			if (previewBindingValidationIssues(binding).length > 0) continue;
			byTrace.set(record.traceId, { traceId: record.traceId, ...binding });
		}
	}
	return [...byTrace.values()];
}

function objectRecord(value: unknown): Record<string, unknown> | undefined {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;
}

function objectList(value: unknown): Record<string, unknown>[] {
	return Array.isArray(value)
		? value.filter(
				(entry): entry is Record<string, unknown> =>
					Boolean(entry) && typeof entry === "object" && !Array.isArray(entry),
			)
		: [];
}

function stringList(value: unknown): string[] {
	return Array.isArray(value)
		? value.filter((item): item is string => typeof item === "string")
		: [];
}

function boolean(value: unknown): boolean | undefined {
	return typeof value === "boolean" ? value : undefined;
}

function text(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

function normalizeEvidenceViewports(value: unknown): string[] {
	let values: unknown[];
	if (value === undefined) values = ["desktop"];
	else if (Array.isArray(value)) values = value;
	else values = [value];
	return [
		...new Set(
			values.map((item) =>
				typeof item === "string" && item.trim() ? item.trim() : "__invalid__",
			),
		),
	];
}
