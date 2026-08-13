import { readProjectTraceRecords } from "../project/state-file.ts";
import type {
	PreviewCoordinator,
	PreviewRuntimeStatus,
} from "./coordinator.ts";

export type DashboardPreviewAction =
	| "start"
	| "open"
	| "capture"
	| "restart"
	| "stop";

export interface DashboardPreviewCommand {
	action: DashboardPreviewAction;
	targetId: string;
	expectedTargetDigest?: string;
	expectedProfileDigest?: string;
}

export interface DashboardPreviewControl {
	status(): Promise<PreviewRuntimeStatus[]>;
	execute(command: DashboardPreviewCommand): Promise<PreviewRuntimeStatus[]>;
}

export function createDashboardPreviewControl(
	repoRoot: string,
	coordinator: PreviewCoordinator,
): DashboardPreviewControl {
	const records = () => readProjectTraceRecords(repoRoot);
	return {
		status: async () => coordinator.reconcile(await records()),
		async execute(command) {
			const context = await records();
			const current = await coordinator.reconcile(context);
			assertExpectedDigest(current, command);
			if (command.action === "start") {
				return coordinator.start(command.targetId, context);
			}
			if (command.action === "open") {
				return coordinator.open(command.targetId);
			}
			if (command.action === "capture") {
				return coordinator.capture(command.targetId, context);
			}
			if (command.action === "restart") {
				return coordinator.restart(command.targetId, context);
			}
			return coordinator.stop(command.targetId);
		},
	};
}

export function unavailableDashboardPreviewControl(): DashboardPreviewControl {
	return {
		async status() {
			return [];
		},
		async execute() {
			throw new Error(
				"Live Preview requires an active in-process CodeWiki Pi session.",
			);
		},
	};
}

export function parseDashboardPreviewCommand(
	value: unknown,
): DashboardPreviewCommand {
	if (!isRecord(value)) throw new Error("Preview command must be an object.");
	assertKnownKeys(value, [
		"action",
		"targetId",
		"expectedTargetDigest",
		"expectedProfileDigest",
	]);
	const action = value.action;
	if (
		action !== "start" &&
		action !== "open" &&
		action !== "capture" &&
		action !== "restart" &&
		action !== "stop"
	) {
		throw new Error(
			"Preview action must be start, open, capture, restart, or stop.",
		);
	}
	const targetId = identifier(value.targetId, "targetId");
	const expectedTargetDigest = optionalDigest(
		value.expectedTargetDigest,
		"expectedTargetDigest",
	);
	const expectedProfileDigest = optionalDigest(
		value.expectedProfileDigest,
		"expectedProfileDigest",
	);
	return {
		action,
		targetId,
		...(expectedTargetDigest ? { expectedTargetDigest } : {}),
		...(expectedProfileDigest ? { expectedProfileDigest } : {}),
	};
}

function assertExpectedDigest(
	statuses: PreviewRuntimeStatus[],
	command: DashboardPreviewCommand,
): void {
	if (!command.expectedTargetDigest && !command.expectedProfileDigest) return;
	const status = statuses.find(
		(candidate) => candidate.targetId === command.targetId,
	);
	if (!status) {
		throw new Error(
			"Preview target changed; refresh the dashboard before retrying.",
		);
	}
	if (
		command.expectedTargetDigest &&
		status.targetDigest !== command.expectedTargetDigest
	) {
		throw new Error(
			"Preview target changed; refresh the dashboard before retrying.",
		);
	}
	if (
		command.expectedProfileDigest &&
		status.profileDigest !== command.expectedProfileDigest
	) {
		throw new Error(
			"Preview profile changed; refresh the dashboard before retrying.",
		);
	}
}

function identifier(value: unknown, field: "targetId"): string {
	if (
		typeof value !== "string" ||
		!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/.test(value.trim())
	) {
		throw new Error(`Preview ${field} must be a bounded safe identifier.`);
	}
	return value.trim();
}

function optionalDigest(
	value: unknown,
	field: "expectedTargetDigest" | "expectedProfileDigest",
): string | undefined {
	if (value === undefined) return undefined;
	if (typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value)) {
		return value;
	}
	throw new Error(`Preview ${field} must be an exact sha256 digest.`);
}

function assertKnownKeys(
	value: Record<string, unknown>,
	allowed: readonly string[],
): void {
	for (const key of Object.keys(value)) {
		if (!allowed.includes(key))
			throw new Error(`Preview command field ${key} is not supported.`);
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
