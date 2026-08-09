import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { changeTraceId } from "../../../src/changes/change-trace.ts";
import { registerCodewikiExtension } from "../../../src/clients/pi/extension.ts";
import { traceFilePath } from "../../../src/traces/schema.ts";
import { seedChangeAcceptance } from "../../helpers/accepted-change.mjs";
import { testPiProjectServices } from "../../helpers/pi-project-services.mjs";

function mockPi() {
	const tools = [];
	return {
		tools,
		api: {
			registerTool(tool) {
				tools.push(tool);
			},
			registerCommand() {},
			on() {},
		},
	};
}

function toolByName(pi, name) {
	const tool = pi.tools.find((candidate) => candidate.name === name);
	assert.ok(tool, `missing tool ${name}`);
	return tool;
}

const root = await mkdtemp(join(tmpdir(), "codewiki-pi-tool-mutation-"));
try {
	await mkdir(join(root, ".codewiki", "kb"), { recursive: true });
	const { record } = await seedChangeAcceptance(root, {
		id: "CHG-pi-mutation-smoke",
		currentState: "Pi semantic tools can receive Candidate input.",
		desiredState:
			"Pi semantic mutation requires authenticated exact-revision selection.",
		rationale: "External smoke must prove unselected mutation fails closed.",
		sourceRefs: [".codewiki/kb/system/components/api.md"],
	});
	const tracePath = join(root, traceFilePath(changeTraceId(record.change.id)));
	const initialBytes = await readFile(tracePath);
	const pi = mockPi();
	registerCodewikiExtension(pi.api, {
		projectServices: testPiProjectServices(),
	});
	const decideTool = toolByName(pi, "wiki_decide");
	const ctx = { cwd: root, ui: { notify() {} } };
	const candidate = {
		disposition: "approve",
		rationale: "Unselected Candidate must not gain Decision authority.",
	};

	for (const mode of ["preview", "append"]) {
		await assert.rejects(
			decideTool.execute(
				`tool-call-unselected-${mode}`,
				{ input: { ...candidate, mode } },
				undefined,
				undefined,
				ctx,
			),
			/decision_attention_selection_required/,
		);
		assert.deepEqual(await readFile(tracePath), initialBytes);
	}

	console.log(
		JSON.stringify({
			ok: true,
			guard: "decision_attention_selection_required",
			traceUnchanged: true,
		}),
	);
} finally {
	await rm(root, { recursive: true, force: true });
}
