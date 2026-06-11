import type { IsoTimestamp, SourceRef } from "../shared/types.ts";

export interface TraceEvent {
	traceId: string;
	sequence: number;
	kind: string;
	createdAt: IsoTimestamp;
	refs: SourceRef[];
}
