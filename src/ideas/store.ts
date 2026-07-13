import type { ChangeStatus, ChangeType } from "../changes/types.ts";
import type { IdeasRecord } from "./records.ts";

export const DEFAULT_IDEAS_REF = "refs/codewiki/ideas";

export interface IdeasStoreSnapshot {
	head: string | null;
	records: IdeasRecord[];
}

export interface IdeasQuery {
	status?: ChangeStatus;
	type?: ChangeType;
	origin?: IdeasRecord["change"]["provenance"]["origin"];
	text?: string;
}

export interface IdeasWriteInput {
	expectedHead: string | null;
	records: IdeasRecord[];
	message: string;
	actor: string;
	createdAt: string;
}

export interface IdeasWriteResult {
	previousHead: string | null;
	head: string;
	writtenChangeIds: string[];
}

export interface IdeasStore {
	read(): Promise<IdeasStoreSnapshot>;
	get(changeId: string): Promise<IdeasRecord | undefined>;
	query(query?: IdeasQuery): Promise<IdeasRecord[]>;
	write(input: IdeasWriteInput): Promise<IdeasWriteResult>;
}

export class IdeasStoreConflictError extends Error {
	readonly expectedHead: string | null;
	readonly actualHead: string | null;

	constructor(expectedHead: string | null, actualHead: string | null) {
		super(
			`Ideas Store changed concurrently: expected ${expectedHead || "empty"}, found ${actualHead || "empty"}.`,
		);
		this.name = "IdeasStoreConflictError";
		this.expectedHead = expectedHead;
		this.actualHead = actualHead;
	}
}
