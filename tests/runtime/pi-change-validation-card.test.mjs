import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { renderPiChangeValidationCard } from "../../src/pi/rendering/change-validation-card.ts";
import { registerCodewikiTools } from "../../src/pi/tools/index.ts";
import { buildChangeValidationCard } from "../../src/changes/validation-view.ts";
import { createChangeRecord } from "../../src/changes/records.ts";
import {
	acceptedChangeFixture,
	seedChangeAcceptance,
} from "../helpers/accepted-change.mjs";

function registeredTools() {
	const tools = [];
	registerCodewikiTools({ registerTool: (tool) => tools.push(tool) });
	return tools;
}

describe("Pi Change validation card", () => {
	it("renders the three semantic sections and exact identity", () => {
		const record = createChangeRecord(
			acceptedChangeFixture({
				id: "CHG-pi-validation-card",
				currentState: "Pi shows only a mutation receipt.",
				desiredState: "Pi shows a bounded validation card.",
			}),
		);
		const lines = renderPiChangeValidationCard(
			buildChangeValidationCard(record),
		);
		assert.match(
			lines.join("\n"),
			/Current state\nPi shows only a mutation receipt\./,
		);
		assert.match(
			lines.join("\n"),
			/Proposed change\nPi shows a bounded validation card\./,
		);
		assert.match(lines.join("\n"), /Agent opinion/);
		assert.match(
			lines.join("\n"),
			/Revision: 1 · Record: 1 · Status: pending · Validation: valid/,
		);
	});

	it("exposes the shared safe card through wiki_change get results", async () => {
		const root = await mkdtemp(join(tmpdir(), "codewiki-pi-change-card-"));
		try {
			await mkdir(join(root, ".codewiki", "kb"), { recursive: true });
			execFileSync("git", ["init", "-q"], { cwd: root });
			const seeded = await seedChangeAcceptance(root, {
				id: "CHG-pi-tool-card",
				currentState: "The model sees only a completion message.",
				desiredState: "The model sees the exact safe Change card.",
			});
			const tool = registeredTools().find(
				(candidate) => candidate.name === "wiki_change",
			);
			assert.ok(tool);
			const result = await tool.execute(
				"change-card-get",
				{ input: { operation: "get", changeId: seeded.record.change.id } },
				undefined,
				undefined,
				{ cwd: root },
			);
			const modelText = result.content
				.map((item) => item.text || "")
				.join("\n");
			assert.match(modelText, /Current state/);
			assert.match(modelText, /Proposed change/);
			assert.match(modelText, /Agent opinion/);
			assert.match(modelText, /CHG-pi-tool-card/);
			assert.equal(result.details.result.record.change.status, "pending");
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});
