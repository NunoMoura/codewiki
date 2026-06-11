export type IsoTimestamp = string;
export type SourceRef = string;

export interface Result<T> {
	ok: boolean;
	value?: T;
	issues?: string[];
}
