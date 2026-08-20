import { createHash } from "node:crypto";
import type { LoopQualityStandardResult } from "../../changes/trace/types.ts";
import type { WorkState } from "../../work-state/types.ts";
import type {
	PlanningAcceptanceCoverage,
	PlanningDependencyEdge,
	PlanningWorkUnitCandidate,
} from "./candidate-content.ts";

export interface EvaluateGraphDeltaPlanningInput {
	changeId: string;
	workUnits: PlanningWorkUnitCandidate[];
	dependencyEdges: PlanningDependencyEdge[];
	acceptanceCoverage: PlanningAcceptanceCoverage[];
	integrationRequirements: string[];
	workState: WorkState;
}

export interface GraphDeltaPlanningQualityResult {
	passed: boolean;
	qualityRef: string;
	standards: LoopQualityStandardResult[];
}

export const PLANNING_GRAPH_DELTA_QUALITY_STANDARDS = Object.freeze([
	{ id: "single_change_ownership", description: "Every Work Unit belongs to the planned Change.", mode: "deterministic" as const },
	{ id: "work_unit_identity", description: "Work Unit identities are unique graph additions.", mode: "deterministic" as const },
	{ id: "work_unit_obligations", description: "Work Unit obligations are explicit.", mode: "deterministic" as const },
	{ id: "dependency_graph", description: "Dependency edges are known and acyclic.", mode: "deterministic" as const },
	{ id: "acceptance_coverage", description: "Change acceptance is covered by Work Units.", mode: "deterministic" as const },
	{ id: "path_ordering", description: "Overlapping path scopes are ordered.", mode: "deterministic" as const },
	{ id: "integration_requirements", description: "Change integration requirements are explicit.", mode: "deterministic" as const },
]);

export function evaluateGraphDeltaPlanning(
	input: EvaluateGraphDeltaPlanningInput,
): GraphDeltaPlanningQualityResult {
	const workUnitIds = new Set(input.workUnits.map((unit) => unit.id));
	const dependencies = input.dependencyEdges.map((edge) => [
		edge.fromWorkUnitId,
		edge.toWorkUnitId,
	] as const);
	const existingIds = new Set(input.workState.workUnitIds);
	const knownIds = new Set([...workUnitIds, ...existingIds]);
	const completeDependencies = [
		...(input.workState.workUnits || []).flatMap((unit) =>
			unit.dependsOn.map((dependencyId) => [unit.id, dependencyId] as const),
		),
		...dependencies,
	];
	const standards: LoopQualityStandardResult[] = [
		standard(
			"single_change_ownership",
			input.workUnits.every((unit) => unit.owningChangeId === input.changeId),
			"Every Work Unit must be owned by the planned Change.",
		),
		standard(
			"work_unit_identity",
			workUnitIds.size === input.workUnits.length &&
				input.workUnits.every((unit) => !existingIds.has(unit.id)),
			"Work Unit ids must be unique additions to the global Work Graph.",
		),
		standard(
			"work_unit_obligations",
			input.workUnits.every(
				(unit) =>
					unit.acceptanceRequirements.length > 0 &&
					unit.verification.length > 0 &&
					unit.pathScopes.length > 0,
			),
			"Every Work Unit needs acceptance, verification, and path obligations.",
		),
		standard(
			"dependency_graph",
			dependencies.every(
				([from, to]) =>
					from !== to && workUnitIds.has(from) && knownIds.has(to),
			) && !hasCycle(completeDependencies),
			"Dependency edges must originate in this delta, target known Work Units, and remain acyclic.",
		),
		standard(
			"acceptance_coverage",
			input.acceptanceCoverage.length > 0 &&
				input.acceptanceCoverage.every(
					(entry) =>
						entry.workUnitIds.length > 0 &&
						entry.workUnitIds.every((id: string) => workUnitIds.has(id)),
				),
			"Every acceptance requirement must map to known Work Units.",
		),
		standard(
			"path_ordering",
			pathOrderingIsSafe(input.workUnits, dependencies),
			"Overlapping Work Unit path scopes require an explicit dependency edge.",
		),
		standard(
			"integration_requirements",
			input.integrationRequirements.length > 0,
			"Change integration requirements must be explicit.",
		),
	];
	const qualityRef = `sha256:${createHash("sha256")
		.update(JSON.stringify(standards))
		.digest("hex")}`;
	return {
		passed: standards.every((entry) => entry.status === "met"),
		qualityRef,
		standards,
	};
}

function standard(
	id: string,
	passed: boolean,
	message: string,
): LoopQualityStandardResult {
	return passed
		? { id, status: "met", mode: "deterministic", description: message, refs: [] }
		: {
				id,
				status: "unmet",
				mode: "deterministic",
				description: message,
				message,
				refs: [],
			};
}

function pathOrderingIsSafe(
	workUnits: PlanningWorkUnitCandidate[],
	edges: readonly (readonly [string, string])[],
): boolean {
	const ordered = new Set(edges.flatMap(([from, to]) => [`${from}:${to}`, `${to}:${from}`]));
	for (let leftIndex = 0; leftIndex < workUnits.length; leftIndex += 1) {
		for (let rightIndex = leftIndex + 1; rightIndex < workUnits.length; rightIndex += 1) {
			const left = workUnits[leftIndex];
			const right = workUnits[rightIndex];
			if (!left || !right) continue;
			if (
				pathsOverlap(left.pathScopes, right.pathScopes) &&
				!ordered.has(`${left.id}:${right.id}`)
			) return false;
		}
	}
	return true;
}

function pathsOverlap(left: string[], right: string[]): boolean {
	return left.some((leftPath) =>
		right.some(
			(rightPath) =>
				leftPath === rightPath ||
				leftPath.startsWith(`${rightPath}/`) ||
				rightPath.startsWith(`${leftPath}/`),
		),
	);
}

function hasCycle(edges: readonly (readonly [string, string])[]): boolean {
	const dependencies = new Map<string, string[]>();
	for (const [from, to] of edges) {
		dependencies.set(from, [...(dependencies.get(from) || []), to]);
	}
	const visiting = new Set<string>();
	const visited = new Set<string>();
	const visit = (id: string): boolean => {
		if (visiting.has(id)) return true;
		if (visited.has(id)) return false;
		visiting.add(id);
		if ((dependencies.get(id) || []).some(visit)) return true;
		visiting.delete(id);
		visited.add(id);
		return false;
	};
	return [...dependencies.keys()].some(visit);
}
