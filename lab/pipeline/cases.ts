import type { PipelineCase } from "./types.ts";

export const pipelineCases: PipelineCase[] = [
	{
		id: "package-boundary-carryover",
		description:
			"Decision facts about package/Pi lab boundaries survive through planning and implementation evidence.",
		expected: "pass",
		weight: 1,
		input: {
			traceId: "TRACE-lab-package-boundary-carryover",
			userIntent:
				"Keep lab out of the packed Pi extension while preserving package readiness checks.",
			expectedFacts: [
				{
					id: "fact-lab-excluded",
					text: "lab/** is excluded from packed package runtime",
				},
				{
					id: "fact-extension-dist",
					text: "Pi extension metadata points to dist/pi/extension.js",
				},
				{
					id: "fact-pack-smoke",
					text: "package install smoke verifies lab tests and .codewiki are absent",
				},
			],
			decision: {
				changeId: "DEC-package-boundary",
				refs: [
					"README.md",
					"package.json",
					"tests/runtime/package-install-smoke.mjs",
				],
				facts: ["fact-lab-excluded", "fact-extension-dist", "fact-pack-smoke"],
			},
			planning: {
				refs: ["DEC-package-boundary"],
				workItems: [
					{
						id: "WU-package-boundary-guard",
						decisionRefs: ["DEC-package-boundary"],
						pathScopes: [
							"tests/runtime/package-install-smoke.mjs",
							"package.json",
						],
						acceptanceCriteria: [
							"AC-lab-excluded",
							"AC-extension-dist",
							"AC-pack-smoke",
						],
						facts: [
							"fact-lab-excluded",
							"fact-extension-dist",
							"fact-pack-smoke",
						],
					},
				],
			},
			implementation: {
				refs: ["WU-package-boundary-guard"],
				changes: [
					{
						id: "IMP-package-boundary-guard",
						workItemRefs: ["WU-package-boundary-guard"],
						acceptanceCovered: [
							"AC-lab-excluded",
							"AC-extension-dist",
							"AC-pack-smoke",
						],
						evidenceRefs: [
							"tests/runtime/package-install-smoke.mjs",
							"tests/runtime/readiness-checklist.test.mjs",
						],
						facts: [
							"fact-lab-excluded",
							"fact-extension-dist",
							"fact-pack-smoke",
						],
					},
				],
			},
		},
	},
	{
		id: "decision-fact-lost-before-implementation",
		description:
			"A decision fact reaches planning but is lost before implementation evidence, making the trace insufficient for closure.",
		expected: "fail",
		weight: 2,
		input: {
			traceId: "TRACE-lab-lost-fact",
			userIntent:
				"Preserve weighted standard semantics while refactoring loop exits.",
			expectedFacts: [
				{
					id: "fact-standard-weights",
					text: "standard weights remain editable in candidate files",
				},
				{
					id: "fact-loss-weights",
					text: "case loss weights remain locked in the evaluator",
				},
			],
			decision: {
				changeId: "DEC-weighted-standards",
				refs: [".codewiki/kb/system/lab.md", "lab/runner/score.ts"],
				facts: ["fact-standard-weights", "fact-loss-weights"],
			},
			planning: {
				refs: ["DEC-weighted-standards"],
				workItems: [
					{
						id: "WU-weighted-standards",
						decisionRefs: ["DEC-weighted-standards"],
						pathScopes: ["lab/runner/types.ts", "lab/runner/score.ts"],
						acceptanceCriteria: ["AC-standard-weights", "AC-loss-weights"],
						facts: ["fact-standard-weights", "fact-loss-weights"],
					},
				],
			},
			implementation: {
				refs: ["WU-weighted-standards"],
				changes: [
					{
						id: "IMP-weighted-standards",
						workItemRefs: ["WU-weighted-standards"],
						acceptanceCovered: ["AC-standard-weights", "AC-loss-weights"],
						evidenceRefs: ["lab/runner/types.ts", "lab/runner/score.ts"],
						facts: ["fact-standard-weights"],
					},
				],
			},
		},
	},
	{
		id: "acceptance-coverage-lost-in-trace",
		description:
			"Implementation preserves facts but fails to cover every planning acceptance criterion.",
		expected: "fail",
		weight: 2,
		input: {
			traceId: "TRACE-lab-acceptance-gap",
			userIntent: "Add trace projection coverage for runtime board state.",
			expectedFacts: [
				{
					id: "fact-board-source",
					text: "runtime board is generated from trace records",
				},
				{
					id: "fact-board-command",
					text: "wiki_state board view exposes runtime board",
				},
			],
			decision: {
				changeId: "DEC-runtime-board",
				refs: ["src/runtime/board.ts", "src/views/trace-board.ts"],
				facts: ["fact-board-source", "fact-board-command"],
			},
			planning: {
				refs: ["DEC-runtime-board"],
				workItems: [
					{
						id: "WU-runtime-board",
						decisionRefs: ["DEC-runtime-board"],
						pathScopes: ["src/runtime/board.ts", "src/api/state.ts"],
						acceptanceCriteria: ["AC-board-from-trace", "AC-board-command"],
						facts: ["fact-board-source", "fact-board-command"],
					},
				],
			},
			implementation: {
				refs: ["WU-runtime-board"],
				changes: [
					{
						id: "IMP-runtime-board",
						workItemRefs: ["WU-runtime-board"],
						acceptanceCovered: ["AC-board-from-trace"],
						evidenceRefs: [
							"src/runtime/board.ts",
							"tests/views/runtime-board.test.mjs",
						],
						facts: ["fact-board-source", "fact-board-command"],
					},
				],
			},
		},
	},
];
