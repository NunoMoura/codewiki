import { createHash } from "node:crypto";
import { GitRefChangeStore } from "../changes/git-ref-store.ts";
import {
	buildChangeValidationCard,
	type ChangeValidationCard,
} from "../changes/validation-view.ts";
import type { ChangeStatus, ChangeValidationState } from "../changes/types.ts";

const MAX_DASHBOARD_CHANGES = 100;
const MAX_DASHBOARD_STATE_BYTES = 256_000;

export interface DashboardChangesSummary {
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

export interface DashboardChangesState {
	generatedAt: string;
	available: boolean;
	blockers: string[];
	head: string | null;
	stateDigest: string;
	records: ChangeValidationCard[];
	summary: DashboardChangesSummary;
	truncated: boolean;
}

interface DashboardChangeFilters {
	status?: ChangeStatus;
	validationState?: ChangeValidationState;
	text?: string;
}

export async function loadDashboardChangesState(
	repoRoot: string,
): Promise<DashboardChangesState> {
	let snapshot;
	try {
		snapshot = await new GitRefChangeStore({ repoRoot }).read();
	} catch (error) {
		if (!String(error).includes("not a git repository")) throw error;
		return unavailableChangesState();
	}
	const sortedRecords = [...snapshot.records].sort((left, right) =>
		left.change.id.localeCompare(right.change.id),
	);
	const records: ChangeValidationCard[] = [];
	let retainedBytes = 0;
	for (const record of sortedRecords.slice(0, MAX_DASHBOARD_CHANGES)) {
		const card = buildChangeValidationCard(record);
		const cardBytes = Buffer.byteLength(JSON.stringify(card), "utf8");
		if (records.length > 0 && retainedBytes + cardBytes > MAX_DASHBOARD_STATE_BYTES) {
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

function unavailableChangesState(): DashboardChangesState {
	const records: ChangeValidationCard[] = [];
	return {
		generatedAt: new Date().toISOString(),
		available: false,
		blockers: ["Changes Backlog requires a Git repository."],
		head: null,
		stateDigest: stateDigest(null, records),
		records,
		summary: changesSummary([]),
		truncated: false,
	};
}

export function filterDashboardChanges(
	state: DashboardChangesState,
	filters: DashboardChangeFilters = {},
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
): DashboardChangesSummary {
	const summary: DashboardChangesSummary = {
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
