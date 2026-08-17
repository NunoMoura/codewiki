import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { projectServerDevLog } from "../../../src/project-server/queries/dev-log.ts";
import { createDevLogEntry } from "../../../src/project-server/persistence/dev-log.ts";

describe("Project Server Dev Log query", () => {
	it("projects bounded newest-first diagnostics without adding authority", () => {
		const entries = [1, 2, 3].map((index) =>
			createDevLogEntry({
				id: `dev-${index}`,
				timestamp: `2026-07-12T12:00:0${index}.000Z`,
				traceId: "TRACE-dev",
				workUnitId: "WU-dev",
				workerId: "worker-001",
				attemptId: "claim-001",
				category: "check",
				action: "check.finished",
				status: "success",
				refs: ["tests/project-server/queries/dev-log.test.mjs"],
				...(index === 3 ? { redactions: ["authorization"] } : {}),
			}),
		);
		const projection = projectServerDevLog(entries, 2);
		assert.equal(projection.available, true);
		assert.equal(projection.entryCount, 3);
		assert.deepEqual(projection.items.map((item) => item.id), ["dev-3", "dev-2"]);
		assert.equal(projection.items[0].redacted, true);
		assert.equal(Object.hasOwn(projection.items[0], "authority"), false);
	});

	it("distinguishes unavailable diagnostics from an empty log", () => {
		assert.deepEqual(projectServerDevLog(undefined), {
			available: false,
			entryCount: 0,
			items: [],
		});
		assert.equal(projectServerDevLog([]).available, true);
	});
});
