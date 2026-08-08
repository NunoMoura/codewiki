export const SYSTEM_CONNECTION_TYPES = Object.freeze([
	"authorizes",
	"consumes",
	"executes",
	"invokes",
	"observes",
	"produces",
	"queries",
	"reads",
	"returns",
	"synchronizes",
	"writes",
] as const);

export const SYSTEM_DIAGRAM_ZONES = Object.freeze([
	"core",
	"client",
	"harness",
	"repository",
	"provider",
] as const);

export const SYSTEM_BOUNDARY_TYPES = Object.freeze([
	"trust",
	"authority",
	"persistence",
	"network",
	"external-effect",
] as const);

export type SystemConnectionType = (typeof SYSTEM_CONNECTION_TYPES)[number];
export type SystemDiagramZone = (typeof SYSTEM_DIAGRAM_ZONES)[number];
export type SystemBoundaryType = (typeof SYSTEM_BOUNDARY_TYPES)[number];

export interface SystemDiagramComponent {
	readonly id: string;
	readonly concept: string;
	readonly label: string;
	readonly zone: SystemDiagramZone;
}

export interface SystemDiagramBoundary {
	readonly type: SystemBoundaryType;
	readonly failure: string;
}

export interface SystemDiagramConnection {
	readonly id: string;
	readonly from: string;
	readonly to: string;
	readonly type: SystemConnectionType;
	readonly label: string;
	readonly boundary?: SystemDiagramBoundary;
}

export interface SystemDiagramFlowPath {
	readonly connections: readonly string[];
}

export interface SystemDiagramFlow {
	readonly concept: string;
	readonly paths: readonly SystemDiagramFlowPath[];
}

export interface SystemDiagram {
	readonly id: string;
	readonly purpose: string;
	readonly components: readonly SystemDiagramComponent[];
	readonly connections: readonly SystemDiagramConnection[];
	readonly flows: readonly SystemDiagramFlow[];
}

export interface SystemDiagramIssue {
	readonly code:
		| "diagram_purpose_too_large"
		| "too_many_components"
		| "duplicate_component_id"
		| "unknown_component_concept"
		| "invalid_component_zone"
		| "too_many_connections"
		| "duplicate_connection_id"
		| "unknown_connection_component"
		| "invalid_connection_type"
		| "connection_label_too_large"
		| "invalid_connection_boundary"
		| "missing_connection_boundary"
		| "unexpected_connection_boundary"
		| "unknown_flow_concept"
		| "flow_without_path"
		| "flow_path_too_short"
		| "flow_path_too_long"
		| "unknown_flow_connection"
		| "noncontiguous_flow_path"
		| "unmapped_boundary_connection"
		| "component_not_diagrammed"
		| "flow_not_diagrammed";
	readonly diagramId?: string;
	readonly component?: string;
	readonly flow?: string;
	readonly connection?: string;
	readonly message: string;
}

const MAX_COMPONENTS = 25;
const MAX_CONNECTIONS = 40;
const MAX_FLOW_PATH_CONNECTIONS = 20;
const MAX_CONNECTION_LABEL_CHARACTERS = 80;
const MAX_PURPOSE_CHARACTERS = 240;

export function validateSystemDiagrams(input: {
	readonly diagrams: readonly SystemDiagram[];
	readonly componentConcepts: readonly string[];
	readonly flowConcepts: readonly string[];
}): SystemDiagramIssue[] {
	const issues = input.diagrams.flatMap((diagram) =>
		validateSystemDiagram(diagram, input.componentConcepts, input.flowConcepts),
	);
	const diagrammedComponents = new Set(
		input.diagrams.flatMap((diagram) =>
			diagram.components.map((component) => component.concept),
		),
	);
	const diagrammedFlows = new Set(
		input.diagrams.flatMap((diagram) => diagram.flows.map((flow) => flow.concept)),
	);
	for (const component of input.componentConcepts) {
		if (diagrammedComponents.has(component)) continue;
		issues.push({
			code: "component_not_diagrammed",
			component,
			message: `System Component ${component} has no diagram component block.`,
		});
	}
	for (const flow of input.flowConcepts) {
		if (diagrammedFlows.has(flow)) continue;
		issues.push({
			code: "flow_not_diagrammed",
			flow,
			message: `System Flow ${flow} has no diagram flow mapping.`,
		});
	}
	return issues;
}

function validateSystemDiagram(
	diagram: SystemDiagram,
	componentConcepts: readonly string[],
	flowConcepts: readonly string[],
): SystemDiagramIssue[] {
	const issues: SystemDiagramIssue[] = [];
	if (diagram.purpose.length > MAX_PURPOSE_CHARACTERS) {
		issues.push(issue("diagram_purpose_too_large", diagram, {}, `Diagram purpose exceeds ${MAX_PURPOSE_CHARACTERS} characters.`));
	}
	if (diagram.components.length > MAX_COMPONENTS) {
		issues.push(issue("too_many_components", diagram, {}, `Diagram exceeds ${MAX_COMPONENTS} component blocks.`));
	}
	if (diagram.connections.length > MAX_CONNECTIONS) {
		issues.push(issue("too_many_connections", diagram, {}, `Diagram exceeds ${MAX_CONNECTIONS} connections.`));
	}
	const componentIds = new Set<string>();
	const components = new Map<string, SystemDiagramComponent>();
	for (const component of diagram.components) {
		if (componentIds.has(component.id)) {
			issues.push(issue("duplicate_component_id", diagram, { component: component.id }, "Component IDs must be unique within a diagram."));
		}
		componentIds.add(component.id);
		components.set(component.id, component);
		if (!componentConcepts.includes(component.concept)) {
			issues.push(issue("unknown_component_concept", diagram, { component: component.concept }, "Diagram component must reference a System Component concept."));
		}
		if (!SYSTEM_DIAGRAM_ZONES.includes(component.zone)) {
			issues.push(issue("invalid_component_zone", diagram, { component: component.id }, "Component zone must use the closed System diagram vocabulary."));
		}
	}
	const connectionIds = new Set<string>();
	const connections = new Map<string, SystemDiagramConnection>();
	for (const connection of diagram.connections) {
		if (connectionIds.has(connection.id)) {
			issues.push(issue("duplicate_connection_id", diagram, { connection: connection.id }, "Connection IDs must be unique within a diagram."));
		}
		connectionIds.add(connection.id);
		connections.set(connection.id, connection);
		const from = components.get(connection.from);
		const to = components.get(connection.to);
		if (!from || !to) {
			issues.push(issue("unknown_connection_component", diagram, { connection: connection.id }, "Connection endpoints must name diagram component blocks."));
		}
		if (!SYSTEM_CONNECTION_TYPES.includes(connection.type)) {
			issues.push(issue("invalid_connection_type", diagram, { connection: connection.id }, "Connection type must use the closed System connection vocabulary."));
		}
		if (connection.label.length > MAX_CONNECTION_LABEL_CHARACTERS) {
			issues.push(issue("connection_label_too_large", diagram, { connection: connection.id }, `Connection label exceeds ${MAX_CONNECTION_LABEL_CHARACTERS} characters.`));
		}
		if (
			connection.boundary &&
			(!SYSTEM_BOUNDARY_TYPES.includes(connection.boundary.type) ||
				connection.boundary.failure.trim().length === 0)
		) {
			issues.push(issue("invalid_connection_boundary", diagram, { connection: connection.id }, "Connection boundary requires a supported type and explicit failure behavior."));
		}
		const crossesZone = from !== undefined && to !== undefined && from.zone !== to.zone;
		if (crossesZone && !connection.boundary) {
			issues.push(issue("missing_connection_boundary", diagram, { connection: connection.id }, "Cross-zone connection requires boundary type and failure behavior."));
		}
		if (!crossesZone && connection.boundary) {
			issues.push(issue("unexpected_connection_boundary", diagram, { connection: connection.id }, "Same-zone connection cannot declare a boundary crossing."));
		}
	}
	const mappedConnections = new Set<string>();
	for (const flow of diagram.flows) {
		if (!flowConcepts.includes(flow.concept)) {
			issues.push(issue("unknown_flow_concept", diagram, { flow: flow.concept }, "Diagram flow must reference a System Flow concept."));
		}
		if (flow.paths.length === 0) {
			issues.push(issue("flow_without_path", diagram, { flow: flow.concept }, "Every System Flow mapping requires at least one path."));
		}
		for (const path of flow.paths) {
			if (path.connections.length < 2) {
				issues.push(issue("flow_path_too_short", diagram, { flow: flow.concept }, "Every System Flow path requires at least two component connections."));
			}
			if (path.connections.length > MAX_FLOW_PATH_CONNECTIONS) {
				issues.push(issue("flow_path_too_long", diagram, { flow: flow.concept }, `System Flow path exceeds ${MAX_FLOW_PATH_CONNECTIONS} connections.`));
			}
			let previous: SystemDiagramConnection | undefined;
			for (const connectionId of path.connections) {
				mappedConnections.add(connectionId);
				const connection = connections.get(connectionId);
				if (!connection) {
					issues.push(issue("unknown_flow_connection", diagram, { flow: flow.concept, connection: connectionId }, "Flow path references an unknown connection."));
					previous = undefined;
					continue;
				}
				if (previous && previous.to !== connection.from) {
					issues.push(issue("noncontiguous_flow_path", diagram, { flow: flow.concept, connection: connectionId }, "Flow path connections must form a contiguous directed path."));
				}
				previous = connection;
			}
		}
	}
	for (const connection of diagram.connections) {
		if (!connection.boundary || mappedConnections.has(connection.id)) continue;
		issues.push(issue("unmapped_boundary_connection", diagram, { connection: connection.id }, "Every declared boundary connection requires a System Flow mapping."));
	}
	return issues;
}

function issue(
	code: SystemDiagramIssue["code"],
	diagram: SystemDiagram,
	location: Omit<SystemDiagramIssue, "code" | "diagramId" | "message">,
	message: string,
): SystemDiagramIssue {
	return { code, diagramId: diagram.id, ...location, message };
}
