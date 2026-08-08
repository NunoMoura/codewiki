import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validateSystemDiagrams } from "../../src/knowledge/system-diagrams.ts";

const components = [
	"/system/components/runtime.md",
	"/system/components/verification.md",
	"/system/components/change-trace.md",
];
const flows = ["/system/flows/change-lifecycle.md"];

function validDiagram() {
	return {
		id: "architecture",
		purpose: "Show the authoritative verification and persistence path.",
		components: [
			{
				id: "runtime",
				concept: "/system/components/runtime.md",
				label: "Runtime",
				zone: "core",
			},
			{
				id: "verification",
				concept: "/system/components/verification.md",
				label: "Verification",
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
				id: "runtime-invokes-verification",
				from: "runtime",
				to: "verification",
				type: "invokes",
				label: "runs Checks",
			},
			{
				id: "verification-returns-runtime",
				from: "verification",
				to: "runtime",
				type: "returns",
				label: "returns Exit Report",
			},
			{
				id: "runtime-writes-trace",
				from: "runtime",
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
							"runtime-invokes-verification",
							"verification-returns-runtime",
							"runtime-writes-trace",
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
			{ connections: ["runtime-invokes-verification"] },
			{ connections: ["runtime-writes-trace", "verification-returns-runtime"] },
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
