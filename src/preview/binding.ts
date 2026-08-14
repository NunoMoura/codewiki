import type { TraceRecord } from "../changes/trace/types.ts";

const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/;
const EXACT_DIGEST = /^sha256:[a-f0-9]{64}$/;

export type PreviewBindingActivation = "implementation";
export type PreviewBindingAutoOpen = "once_per_target" | "manual";

export interface UiPreviewTargetBindingInput {
	targetId?: string;
	targetDigest?: string;
	profileId?: string;
	profileDigest?: string;
	workItemIds?: string[];
	contributingChangeIds?: string[];
	required?: boolean;
	activation?: PreviewBindingActivation | string;
	autoOpen?: PreviewBindingAutoOpen | string;
}

export interface UiPreviewTargetBinding {
	targetId: string;
	targetDigest: string;
	profileId: string;
	profileDigest: string;
	workItemIds: string[];
	contributingChangeIds: string[];
	required: boolean;
	activation: PreviewBindingActivation;
	autoOpen: PreviewBindingAutoOpen;
}

export interface TraceUiPreviewTargetBinding extends UiPreviewTargetBinding {
	traceIds: string[];
	sprintIds: string[];
}

export function normalizeUiPreviewTargetBinding(
	input: UiPreviewTargetBindingInput,
): UiPreviewTargetBinding {
	return {
		targetId: text(input.targetId),
		targetDigest: text(input.targetDigest),
		profileId: text(input.profileId),
		profileDigest: text(input.profileDigest),
		workItemIds: normalizedStrings(input.workItemIds),
		contributingChangeIds: normalizedStrings(input.contributingChangeIds),
		required: input.required === undefined ? true : (input.required as boolean),
		activation:
			input.activation === undefined
				? "implementation"
				: (input.activation as PreviewBindingActivation),
		autoOpen:
			input.autoOpen === undefined
				? "once_per_target"
				: (input.autoOpen as PreviewBindingAutoOpen),
	};
}

export function uiPreviewTargetBindingValidationIssues(
	binding: UiPreviewTargetBinding,
): string[] {
	const issues: string[] = [];
	for (const [field, value] of [
		["targetId", binding.targetId],
		["profileId", binding.profileId],
	] as const) {
		if (!SAFE_IDENTIFIER.test(value)) {
			issues.push(`Preview ${field} must be a bounded safe identifier.`);
		}
	}
	for (const [field, value] of [
		["targetDigest", binding.targetDigest],
		["profileDigest", binding.profileDigest],
	] as const) {
		if (!EXACT_DIGEST.test(value)) {
			issues.push(`Preview ${field} must be an exact sha256 digest.`);
		}
	}
	if (binding.workItemIds.length === 0) {
		issues.push("Preview workItemIds must identify planned work.");
	}
	if (binding.contributingChangeIds.length === 0) {
		issues.push(
			"Preview contributingChangeIds must identify accountable Changes.",
		);
	}
	if (
		binding.workItemIds.some((id) => !SAFE_IDENTIFIER.test(id)) ||
		binding.contributingChangeIds.some((id) => !SAFE_IDENTIFIER.test(id))
	) {
		issues.push("Preview correlation ids must be bounded safe identifiers.");
	}
	if (typeof binding.required !== "boolean") {
		issues.push("Preview required must be boolean.");
	}
	if (binding.activation !== "implementation") {
		issues.push("Preview activation must be implementation.");
	}
	if (binding.autoOpen !== "once_per_target" && binding.autoOpen !== "manual") {
		issues.push("Preview autoOpen must be once_per_target or manual.");
	}
	return issues;
}

export function traceUiPreviewTargetBindings(
	records: TraceRecord[],
): TraceUiPreviewTargetBinding[] {
	const bindings = new Map<string, TraceUiPreviewTargetBinding>();
	for (const record of records) {
		if (
			record.type !== "trace_event" ||
			record.loop !== "planning" ||
			record.event !== "work_units_created"
		) {
			continue;
		}
		const output = objectRecord(record.data?.output);
		for (const sprint of objectList(output?.sprints)) {
			const sprintId = text(sprint.id);
			const sprintWorkItemIds = stringList(sprint.workItemIds);
			const sprintChangeIds = stringList(sprint.participatingChangeIds);
			for (const value of objectList(sprint.uiPreviewTargets)) {
				const binding = normalizeUiPreviewTargetBinding({
					targetId: text(value.targetId),
					targetDigest: text(value.targetDigest),
					profileId: text(value.profileId),
					profileDigest: text(value.profileDigest),
					workItemIds: stringList(value.workItemIds),
					contributingChangeIds: stringList(value.contributingChangeIds),
					required: boolean(value.required),
					activation: text(value.activation),
					autoOpen: text(value.autoOpen),
				});
				if (uiPreviewTargetBindingValidationIssues(binding).length > 0)
					continue;
				if (
					binding.workItemIds.some((id) => !sprintWorkItemIds.includes(id)) ||
					binding.contributingChangeIds.some(
						(id) => !sprintChangeIds.includes(id),
					)
				) {
					continue;
				}
				const key = [
					binding.targetId,
					binding.targetDigest,
					binding.profileId,
					binding.profileDigest,
					String(binding.required),
					binding.activation,
					binding.autoOpen,
				].join("\0");
				const current = bindings.get(key);
				bindings.set(key, {
					...binding,
					workItemIds: unique([
						...(current?.workItemIds || []),
						...binding.workItemIds,
					]),
					contributingChangeIds: unique([
						...(current?.contributingChangeIds || []),
						...binding.contributingChangeIds,
					]),
					traceIds: unique([...(current?.traceIds || []), record.traceId]),
					sprintIds: unique([
						...(current?.sprintIds || []),
						...(sprintId ? [sprintId] : []),
					]),
				});
			}
		}
	}
	return [...bindings.values()].sort((left, right) =>
		left.targetId.localeCompare(right.targetId),
	);
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

function normalizedStrings(value: unknown): string[] {
	return unique(
		stringList(value)
			.map((item) => item.trim())
			.filter(Boolean),
	);
}

function boolean(value: unknown): boolean | undefined {
	return typeof value === "boolean" ? value : undefined;
}

function text(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

function unique(values: string[]): string[] {
	return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}
