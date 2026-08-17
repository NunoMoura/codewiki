import { createHash } from "node:crypto";
import { ChangeTraceStore } from "../../changes/trace/store.ts";
import {
	buildChangeValidationCard,
	type ChangeValidationCard,
} from "../../changes/validation-view.ts";
import type { ChangeStatus, ChangeValidationState } from "../../changes/types.ts";

const MAX_RUNTIME_CHANGES = 100;
const MAX_RUNTIME_CHANGES_BYTES = 256_000;

export interface ProjectServerChangesSummary {
	total: number;
	pending: number;
	accepted: number;
	deferred: number;
	rejected: number;
	withdrawn: number;
	superseded: number;
	draft: number;
	incomplete: number;
	valid: number;
	invalid: number;
	stale: number;
}

export interface ProjectServerChangesState {
	generatedAt: string;
	available: boolean;
	blockers: string[];
	head: string | null;
	stateDigest: string;
	records: ChangeValidationCard[];
	summary: ProjectServerChangesSummary;
	truncated: boolean;
}

interface ProjectServerChangeFilters {
	status?: ChangeStatus;
	validationState?: ChangeValidationState;
	text?: string;
}

export async function loadProjectServerChangesState(
	repoRoot: string,
): Promise<ProjectServerChangesState> {
	const snapshot = await new ChangeTraceStore({ repoRoot }).read();
	const sortedRecords = [...snapshot.records].sort((left, right) =>
		left.change.id.localeCompare(right.change.id),
	);
	const records: ChangeValidationCard[] = [];
	let retainedBytes = 0;
	for (const record of sortedRecords.slice(0, MAX_RUNTIME_CHANGES)) {
		const card = buildChangeValidationCard(record);
		const cardBytes = Buffer.byteLength(JSON.stringify(card), "utf8");
		if (
			records.length > 0 &&
			retainedBytes + cardBytes > MAX_RUNTIME_CHANGES_BYTES
		) {
			break;
		}
		records.push(card);
		retainedBytes += cardBytes;
	}
	return {
		generatedAt: new Date().toISOString(),
		available: true,
		blockers: [],
		head: snapshot.head,
		stateDigest: stateDigest(snapshot.head, records),
		records,
		summary: changesSummary(sortedRecords),
		truncated: sortedRecords.length > records.length,
	};
}

export function filterProjectServerChanges(
	state: ProjectServerChangesState,
	filters: ProjectServerChangeFilters = {},
): ChangeValidationCard[] {
	const query = filters.text?.trim().toLowerCase();
	return state.records.filter((record) => {
		if (filters.status && record.identity.status !== filters.status)
			return false;
		if (
			filters.validationState &&
			record.identity.validationState !== filters.validationState
		) {
			return false;
		}
		if (!query) return true;
		return searchableCardText(record).includes(query);
	});
}

function stateDigest(
	head: string | null,
	records: ChangeValidationCard[],
): string {
	const identity = records.map((record) => record.identity);
	return `sha256:${createHash("sha256")
		.update(JSON.stringify({ head, identity }))
		.digest("hex")}`;
}

function searchableCardText(record: ChangeValidationCard): string {
	return [
		record.identity.changeId,
		record.question,
		record.sections.currentState.text,
		record.sections.proposedChange.text,
		record.sections.proposedChange.rationale,
		...record.sections.agentOpinion.concerns,
	]
		.join(" ")
		.toLowerCase();
}

function changesSummary(
	records: Array<{
		change: {
			status: ChangeStatus;
			validation: { state: ChangeValidationState };
		};
	}>,
): ProjectServerChangesSummary {
	const summary: ProjectServerChangesSummary = {
		total: records.length,
		pending: 0,
		accepted: 0,
		deferred: 0,
		rejected: 0,
		withdrawn: 0,
		superseded: 0,
		draft: 0,
		incomplete: 0,
		valid: 0,
		invalid: 0,
		stale: 0,
	};
	for (const record of records) {
		summary[record.change.status] += 1;
		summary[record.change.validation.state] += 1;
	}
	return summary;
}
