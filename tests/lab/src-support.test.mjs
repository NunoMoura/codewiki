import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	collectDecisionExitIssues,
	evaluateDecisionExit,
} from "../../src/decision/exit.ts";
import {
	BASE_DECISION_QUALITY_STANDARDS,
	DECISION_KIND_QUALITY_STANDARDS,
	decisionQualityStandards,
} from "../../src/decision/quality-standards.ts";
import {
	collectImplementationExitIssues,
	evaluateImplementationExit,
} from "../../src/implementation/exit.ts";
import {
	IMPLEMENTATION_QUALITY_STANDARDS,
	implementationQualityStandards,
} from "../../src/implementation/quality-standards.ts";
import {
	collectPlanningExitIssues,
	evaluatePlanningExit,
} from "../../src/planning/exit.ts";
import {
	PLANNING_QUALITY_STANDARDS,
	planningQualityStandards,
} from "../../src/planning/quality-standards.ts";
import { decisionCases } from "../../lab/decision/cases.ts";
import { implementationCases } from "../../lab/implementation/cases.ts";
import { planningCases } from "../../lab/planning/cases.ts";

describe("src loop exits support the lab substrate", () => {
	it("exposes decision issue collection and weighted standards independently of evaluation wiring", () => {
		const input = decisionCases[0].input;
		const collected = collectDecisionExitIssues(
			input.decisionTable,
			input.options,
		);
		const evaluated = evaluateDecisionExit(input.decisionTable, input.options);
		const standards = decisionQualityStandards(
			collected.issues,
			collected.approvedRows,
		);

		assert.deepEqual(collected.issues, evaluated.issues);
		assert.deepEqual(
			collected.approvedRows.map((row) => row.id),
			evaluated.approvedRowIds,
		);
		assert.deepEqual(standards, evaluated.qualityStandards);
		assertWeightedDefinitions(BASE_DECISION_QUALITY_STANDARDS);
		assertWeightedDefinitions(Object.values(DECISION_KIND_QUALITY_STANDARDS));
	});

	it("exposes planning issue collection and weighted standards independently of evaluation wiring", () => {
		const input = planningCases[0].input.plan;
		const issues = collectPlanningExitIssues(input);
		const evaluated = evaluatePlanningExit(input);
		const standards = planningQualityStandards(issues);

		assert.deepEqual(issues, evaluated.issues);
		assert.deepEqual(standards, evaluated.qualityStandards);
		assertWeightedDefinitions(PLANNING_QUALITY_STANDARDS);
	});

	it("exposes implementation issue collection and weighted standards independently of evaluation wiring", () => {
		const input = implementationCases[0].input.implementation;
		const issues = collectImplementationExitIssues(input);
		const evaluated = evaluateImplementationExit(input);
		const standards = implementationQualityStandards(issues);

		assert.deepEqual(issues, evaluated.issues);
		assert.deepEqual(standards, evaluated.qualityStandards);
		assertWeightedDefinitions(IMPLEMENTATION_QUALITY_STANDARDS);
	});
});

function assertWeightedDefinitions(definitions) {
	assert.equal(definitions.length > 0, true);
	for (const definition of definitions) {
		assert.equal(typeof definition.id, "string");
		assert.equal(definition.id.length > 0, true);
		assert.equal(typeof definition.weight, "number");
		assert.equal(definition.weight > 0, true);
		assert.ok(Array.isArray(definition.codes));
		assert.equal(definition.codes.length > 0, true);
	}
}
