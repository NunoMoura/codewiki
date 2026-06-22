import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { runWikiDecide } from "../../src/api/wiki-decide.ts";
import {
	appendTraceRecord,
	createTraceHead,
	TraceAppendConflictError,
} from "../../src/api/traces.ts";
import { CodewikiApiError } from "../../src/error-handling/api-errors.ts";
import { CodewikiConfigError } from "../../src/error-handling/config-errors.ts";
import {
	CodewikiError,
	codewikiErrorData,
	isCodewikiError,
} from "../../src/error-handling/codewiki-error.ts";
import { resolveWikiConfig } from "../../src/project/config.ts";
import { loadWikiConfigFile } from "../../src/project/config-file.ts";

describe("shared error handling", () => {
	it("normalizes trace append conflicts through CodewikiError", async () => {
		const root = await mkdtemp(join(tmpdir(), "codewiki-error-trace-"));
		try {
			const head = createTraceHead({
				traceId: "TRACE-error-handling",
				title: "Error handling",
				createdAt: "2026-06-19T00:00:00.000Z",
			});
			const first = await appendTraceRecord(root, head, 0);

			await assert.rejects(
				() => appendTraceRecord(root, head, first.previousBytes),
				(error) => {
					assert.equal(error instanceof TraceAppendConflictError, true);
					assert.equal(error instanceof CodewikiError, true);
					assert.equal(isCodewikiError(error), true);
					assert.equal(error.domain, "trace");
					assert.equal(error.code, "append_conflict");
					assert.equal(error.suggestedAction, "refresh_trace");
					assert.equal(error.data.expectedBytes, first.previousBytes);
					assert.equal(error.data.actualBytes, first.nextBytes);
					assert.deepEqual(codewikiErrorData(error)?.refs, [error.path]);
					return true;
				},
			);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("reports config validation and file parsing as config errors", async () => {
		assert.throws(
			() => resolveWikiConfig({ runtime: { maxWorkers: -1 } }),
			(error) => {
				assert.equal(error instanceof CodewikiConfigError, true);
				assert.equal(error.domain, "config");
				assert.equal(error.code, "invalid_value");
				assert.equal(error.path, "runtime.maxWorkers");
				assert.equal(error.suggestedAction, "fix_input");
				return true;
			},
		);

		const root = await mkdtemp(join(tmpdir(), "codewiki-error-config-"));
		try {
			await mkdir(join(root, ".codewiki"), { recursive: true });
			await writeFile(join(root, ".codewiki", "config.json"), "{bad-json");
			await assert.rejects(
				() => loadWikiConfigFile(root),
				(error) => {
					assert.equal(error instanceof CodewikiConfigError, true);
					assert.equal(error.domain, "config");
					assert.equal(error.path.endsWith(".codewiki/config.json"), true);
					assert.equal(error.cause instanceof SyntaxError, true);
					return true;
				},
			);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("reports facade input failures as api errors", async () => {
		await assert.rejects(
			() =>
				runWikiDecide({
					traceId: "TRACE-api-error",
					mode: "append",
					repoRoot: ".",
					expectedBytes: -1,
				}),
			(error) => {
				assert.equal(error instanceof CodewikiApiError, true);
				assert.equal(error.domain, "api");
				assert.equal(error.code, "invalid_input");
				assert.equal(error.operation, "wiki_decide");
				assert.equal(error.field, "expectedBytes");
				assert.equal(error.suggestedAction, "fix_input");
				assert.deepEqual(error.data, {
					operation: "wiki_decide",
					field: "expectedBytes",
					value: -1,
				});
				return true;
			},
		);
	});
});
