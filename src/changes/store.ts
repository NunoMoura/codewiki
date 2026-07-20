import type { ChangeStatus, ChangeType } from "./types.ts";
import type { ChangeRecord } from "./records.ts";

export const CHANGE_TRACE_SOURCE_REF = ".codewiki/traces";

export interface ChangeStoreSnapshot {
	head: string | null;
	records: ChangeRecord[];
}

export interface ChangeQuery {
	status?: ChangeStatus;
	type?: ChangeType;
	origin?: ChangeRecord["change"]["provenance"]["origin"];
	text?: string;
}

export interface ChangeWriteInput {
	expectedHead: string | null;
	records: ChangeRecord[];
	message: string;
	actor: string;
	createdAt: string;
}

export interface ChangeWriteResult {
	previousHead: string | null;
	head: string;
	writtenChangeIds: string[];
}

export interface ChangeStore {
	read(): Promise<ChangeStoreSnapshot>;
	get(changeId: string): Promise<ChangeRecord | undefined>;
	query(query?: ChangeQuery): Promise<ChangeRecord[]>;
	write(input: ChangeWriteInput): Promise<ChangeWriteResult>;
}

export class ChangeStoreConflictError extends Error {
	readonly expectedHead: string | null;
	readonly actualHead: string | null;

	constructor(expectedHead: string | null, actualHead: string | null) {
		super(
			`Change Store changed concurrently: expected ${expectedHead || "empty"}, found ${actualHead || "empty"}.`,
		);
		this.name = "ChangeStoreConflictError";
		this.expectedHead = expectedHead;
		this.actualHead = actualHead;
	}
}
