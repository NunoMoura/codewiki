import type { WorktreeRef } from "../../git/worktrees.ts";
import type { RuntimeWorkUnitClaimCandidate } from "../claims/work-unit-selection.ts";

export type ImplementationWorkerPromptInput = RuntimeWorkUnitClaimCandidate & {
	worktree: WorktreeRef;
};

export function createImplementationWorkerPrompt(
	item: ImplementationWorkerPromptInput,
): string {
	if (!item.worktree.path.trim()) {
		throw new Error("Implementation worker prompt requires isolated worktree custody.");
	}
	return [
		`You are a CodeWiki implementation worker assigned one planning work unit.`,
		``,
		`Work unit: ${item.workUnitId}`,
		`Trace: ${item.traceId}`,
		`Title: ${item.title}`,
		`Planning refs:`,
		...bulletList(item.planningRefs),
		`Component refs:`,
		...bulletList(item.componentRefs),
		`Path scopes:`,
		...bulletList(item.pathScopes),
		`Worktree:`,
		`- path: ${item.worktree.path}`,
		...(item.worktree.branch ? [`- branch: ${item.worktree.branch}`] : []),
		...(item.worktree.baseRef ? [`- base: ${item.worktree.baseRef}`] : []),
		``,
		`Rules:`,
		`- Stay inside assigned path scopes unless you must report a blocker.`,
		`- Worker owns local TDD: write or update tests, show red evidence when required, then make green.`,
		`- Map checks and acceptance evidence to planning acceptance criterion ids.`,
		`- Submit exactly one fenced codewiki-worker-report JSON block with status, workUnitRef, changedFiles, checksRun, contentProofRefs, residualRisks, blockers, notes, and changes.`,
		`- For each change, include checkResults and acceptanceEvidenceItems mapped to planning acceptance criterion ids.`,
		`- Worker output is evidence only; do not close the implementation loop or claim exit.`,
		`- Keep trace refs canonical; commands and prose belong in evidence data, not refs.`,
		``,
		`Report shape:`,
		"```codewiki-worker-report",
		`{`,
		`  "status": "completed",`,
		`  "workUnitRef": "trace:<planning-iteration>#work:${item.workUnitId}",`,
		`  "changedFiles": ["src/example.ts", "tests/example.test.mjs"],`,
		`  "checksRun": ["node --test tests/example.test.mjs"],`,
		`  "contentProofRefs": ["sha256:<working-tree-digest>"],`,
		`  "residualRisks": [],`,
		`  "blockers": [{ "message": "", "refs": [] }],`,
		`  "notes": "",`,
		`  "changes": [`,
		`    {`,
		`      "id": "IC-${item.workUnitId}",`,
		`      "planningRefs": ["trace:<planning-iteration>#work:${item.workUnitId}"],`,
		`      "codePaths": ["src/example.ts"],`,
		`      "testPaths": ["tests/example.test.mjs"],`,
		`      "checkResults": [`,
		`        { "command": "node --test tests/example.test.mjs", "status": "pass" }`,
		`      ],`,
		`      "acceptanceEvidenceItems": [`,
		`        {`,
		`          "criterionId": "AC-001",`,
		`          "summary": "Acceptance criterion satisfied.",`,
		`          "evidenceRefs": ["tests/example.test.mjs"]`,
		`        }`,
		`      ]`,
		`    }`,
		`  ]`,
		`}`,
		"```",
	].join("\n");
}

function bulletList(values: string[]): string[] {
	return values.length > 0 ? values.map((value) => `- ${value}`) : ["- none"];
}
