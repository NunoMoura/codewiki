import {
	appendJsonl,
	isDirectory,
	maybeReadJson,
	pathExists,
	readJson,
	readText,
	writeJson,
	writeText,
} from "./filesystem.ts";

export interface CodewikiFileStore {
	readJson<T>(path: string): Promise<T>;
	maybeReadJson<T>(path: string): Promise<T | null>;
	writeJson(path: string, data: unknown): Promise<void>;
	appendJsonl(path: string, record: unknown): Promise<void>;
	readText(path: string): Promise<string>;
	writeText(path: string, content: string): Promise<void>;
	pathExists(path: string): Promise<boolean>;
	isDirectory(path: string): Promise<boolean>;
}

export function nodeFileStore(): CodewikiFileStore {
	return {
		readText,
		writeText,
		readJson,
		maybeReadJson,
		writeJson,
		appendJsonl,
		pathExists,
		isDirectory,
	};
}
