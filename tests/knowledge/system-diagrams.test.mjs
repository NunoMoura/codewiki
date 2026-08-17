import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validateSystemDiagrams } from "../../src/knowledge/system-diagrams.ts";

const components = [
	"/system/components/project-server.md",
	"/system/components/checks.md",
	"/system/components/change-trace.md",
];
const flows = ["/system/flows/change-lifecycle.md"];

function validDiagram() {
	return {
		id: "architecture",
		purpose: "Show the authoritative Checks and persistence path.",
		components: [
			{
				id: "project-server",
				concept: "/system/components/project-server.md",
				label: "Project Server",
				zone: "core",
			},
			{
				id: "checks",
				concept: "/system/components/checks.md",
				label: "Checks",
				zone: "core",
			},
			{
				id: "trace",
				concept: "/system/components/change-trace.md",
				label: "Change Trace",
				zone: "repository",
			},
		],
		connections: [
			{
				id: "project-server-invokes-checks",
				from: "project-server",
				to: "checks",
				type: "invokes",
				label: "runs Gate",
			},
			{
				id: "checks-return-project-server",
				from: "checks",
				to: "project-server",
				type: "returns",
				label: "returns Gate Report",
			},
			{
				id: "project-server-writes-trace",
				from: "project-server",
				to: "trace",
				type: "writes",
				label: "accepts operations",
				boundary: {
					type: "persistence",
					failure: "Reject write and retain prior accepted head.",
				},
			},
		],
		flows: [
			{
				concept: "/system/flows/change-lifecycle.md",
				paths: [
					{
						connections: [
							"project-server-invokes-checks",
							"checks-return-project-server",
							"project-server-writes-trace",
						],
					},
				],
			},
		],
	};
}

describe("System diagram contract", () => {
	it("requires every Component and Flow to map into canonical topology", () => {
		assert.deepEqual(
			validateSystemDiagrams({
				diagrams: [validDiagram()],
				componentConcepts: components,
				flowConcepts: flows,
			}),
			[],
		);
	});

	it("rejects orphan components and flows", () => {
		const issues = validateSystemDiagrams({
			diagrams: [],
			componentConcepts: components,
			flowConcepts: flows,
		});
		assert.deepEqual(
			issues.map((entry) => entry.code),
			[
				"component_not_diagrammed",
				"component_not_diagrammed",
				"component_not_diagrammed",
				"flow_not_diagrammed",
			],
		);
	});

	it("requires a contiguous path of at least two declared connections", () => {
		const diagram = validDiagram();
		diagram.flows[0].paths = [
			{ connections: ["project-server-invokes-checks"] },
			{ connections: ["project-server-writes-trace", "checks-return-project-server"] },
		];
		const issues = validateSystemDiagrams({
			diagrams: [diagram],
			componentConcepts: components,
			flowConcepts: flows,
		});
		assert.deepEqual(
			issues.map((entry) => entry.code),
			["flow_path_too_short", "noncontiguous_flow_path"],
		);
	});

	it("requires cross-zone connections to declare failure behavior", () => {
		const diagram = validDiagram();
		delete diagram.connections[2].boundary;
		const issues = validateSystemDiagrams({
			diagrams: [diagram],
			componentConcepts: components,
			flowConcepts: flows,
		});
		assert.equal(issues[0].code, "missing_connection_boundary");
	});

	it("requires boundary connections to belong to a Flow", () => {
		const diagram = validDiagram();
		diagram.flows[0].paths[0].connections.pop();
		const issues = validateSystemDiagrams({
			diagrams: [diagram],
			componentConcepts: components,
			flowConcepts: flows,
		});
		assert.equal(issues.at(-1).code, "unmapped_boundary_connection");
	});
});
