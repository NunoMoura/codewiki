import type { PlanningExitInput } from "../../src/planning/loop.ts";
import type { PlanningWorkItem } from "../../src/planning/types.ts";
import type { LabCase } from "../runner/types.ts";
import type { PlanningLabInput } from "./loop.ts";

export const planningCases: LabCase<PlanningLabInput>[] = [
	{
		id: "complete-work-unit-plan",
		loop: "planning",
		description:
			"Bounded work unit with acceptance, verification, assessment, and no uncertainty exits.",
		input: {
			decisions: [{ id: "trace:D-1" }],
			plan: planningInput(planningWorkItem()),
		},
		expected: "pass",
		weight: 10,
	},
	{
		id: "vague-work-unit-plan",
		loop: "planning",
		description:
			"Presence-only plan uses generic requirement, acceptance, verification, and assessment text.",
		input: {
			decisions: [{ id: "trace:D-1" }],
			plan: planningInput(
				planningWorkItem({
					id: "PW-vague",
					title: "Do it",
					outcome: "done",
					technicalRequirements: ["do it"],
					acceptanceCriteria: [{ id: "AC-vague", text: "works" }],
					acceptance: ["works"],
					verification: ["tests"],
					workerProfile: "worker",
					planningAssessment: {
						stance: "worker_ready",
						workUnitSize: "right_sized",
						rightSizing: "ok",
						independence: "ok",
						implementationReadiness: "ok",
						uncertainties: [],
						uncertaintyOwner: "none",
						uncertaintyResolution: "ok",
						rationale: "ok",
						concerns: [],
					},
				}),
			),
		},
		expected: "fail",
		weight: 15,
		expectedFailures: [
			{
				standardId: "planning.outcome_requirement_specificity",
				failureClass: "specificity",
			},
			{
				standardId: "planning.acceptance_verification_specificity",
				failureClass: "verification",
			},
			{
				standardId: "planning.assessment_specificity",
				failureClass: "specificity",
			},
		],
	},
	{
		id: "overlapping-independent-work",
		loop: "planning",
		description:
			"Independent work units with overlapping path scopes fail unless dependency ordering resolves conflict.",
		input: {
			decisions: [{ id: "trace:D-1" }],
			plan: {
				decisionRefs: ["trace:D-1"],
				workItems: [
					planningWorkItem({ id: "PW-a", pathScopes: ["src/runtime/**"] }),
					planningWorkItem({ id: "PW-b", pathScopes: ["src/runtime/host.ts"] }),
				],
				resolutions: [],
			},
		},
		expected: "fail",
		weight: 12,
		expectedFailures: [
			{
				standardId: "planning.path_scope_overlap",
				failureClass: "scope",
			},
		],
	},
	{
		id: "overlap-resolved-by-dependency",
		loop: "planning",
		description:
			"Overlapping path scopes can exit when dependency order makes the work serial and explicit.",
		input: {
			decisions: [{ id: "trace:D-1" }],
			plan: {
				decisionRefs: ["trace:D-1"],
				workItems: [
					planningWorkItem({
						id: "PW-base",
						planningDepth: "standard",
						pathScopes: ["src/runtime/**"],
					}),
					planningWorkItem({
						id: "PW-followup",
						planningDepth: "standard",
						pathScopes: ["src/runtime/host.ts"],
						dependsOn: ["PW-base"],
					}),
				],
				resolutions: [],
			},
		},
		expected: "pass",
		weight: 10,
	},
	{
		id: "micro-plan-with-dependency",
		loop: "planning",
		description:
			"Micro planning with dependencies fails because it is too large for the micro-plan contract.",
		input: {
			decisions: [{ id: "trace:D-1" }],
			plan: planningInput(
				planningWorkItem({
					id: "PW-micro-dependent",
					planningDepth: "micro",
					dependsOn: ["PW-earlier"],
				}),
			),
		},
		expected: "fail",
		weight: 12,
		expectedFailures: [
			{
				standardId: "planning.production_exit_contract",
				failureClass: "contract",
			},
			{
				standardId: "planning.work_unit_structure",
				failureClass: "scope",
			},
			{
				standardId: "planning.dependency_and_conflict_integrity",
				failureClass: "scope",
			},
		],
	},
];

function planningInput(workItem: PlanningWorkItem): PlanningExitInput {
	return {
		decisionRefs: ["trace:D-1"],
		workItems: [workItem],
		resolutions: [],
	};
}

function planningWorkItem(
	overrides: Partial<PlanningWorkItem> = {},
): PlanningWorkItem {
	return {
		id: "PW-good",
		title: "Add deterministic loop-exit adversarial debug coverage",
		decisionRefs: ["trace:D-1"],
		outcome:
			"Loop exit lab identifies whether decision, planning, and implementation outputs can exit too cheaply.",
		technicalRequirements: [
			"Add deterministic adversarial fixtures for each loop exit evaluator.",
			"Report observed verdict, desired verdict, issue codes, standard modes, and open gap count.",
		],
		acceptance: [
			"Lab reports pass, gap, or regression status for every fixture.",
		],
		acceptanceCriteria: [
			{
				id: "AC-1",
				text: "Loop lab reports pass, gap, or regression status for every fixture.",
			},
		],
		componentRefs: [],
		pathScopes: ["src/runtime/types.ts", "tests/lab/loop-exit-score.test.mjs"],
		planningDepth: "micro",
		verification: ["tests/lab/loop-exit-score.test.mjs"],
		workerProfile: "implementation_worker",
		planningAssessment: {
			stance: "worker_ready",
			workUnitSize: "right_sized",
			rightSizing:
				"One worker can add the lab score script, fixtures, and tests without broader runtime changes.",
			independence:
				"The work only depends on existing loop exit evaluator APIs and lab scripts.",
			implementationReadiness:
				"Acceptance criteria, paths, and verification command are explicit.",
			uncertainties: [],
			uncertaintyOwner: "none",
			uncertaintyResolution:
				"No unresolved planning, decision, or user-authority uncertainty remains.",
			rationale:
				"A deterministic lab score is the smallest useful next step before agent-judge optimization.",
			concerns: [],
		},
		dependsOn: [],
		...overrides,
	};
}
