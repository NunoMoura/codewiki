import type { TraceRecord } from "../traces/types.ts";
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
	profileId: string;
	traceId?: string;
	expectedProfileDigest?: string;
}

export interface DashboardPreviewControl {
	status(records: TraceRecord[]): Promise<PreviewRuntimeStatus[]>;
	execute(
		command: DashboardPreviewCommand,
		records: TraceRecord[],
	): Promise<PreviewRuntimeStatus[]>;
}

export function createDashboardPreviewControl(
	coordinator: PreviewCoordinator,
): DashboardPreviewControl {
	return {
		status: (records) => coordinator.reconcile(records),
		async execute(command, records) {
			const current = await coordinator.reconcile(records);
			assertExpectedDigest(current, command);
			if (command.action === "start") {
				return coordinator.start(command.profileId, records);
			}
			if (command.action === "open") {
				return coordinator.open(command.profileId);
			}
			if (command.action === "capture") {
				if (!command.traceId)
					throw new Error("Preview capture requires traceId.");
				return coordinator.capture(command.profileId, command.traceId, records);
			}
			if (command.action === "restart") {
				return coordinator.restart(command.profileId, records);
			}
			return coordinator.stop(command.profileId);
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
		"profileId",
		"traceId",
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
	const profileId = identifier(value.profileId, "profileId");
	const traceId =
		action === "capture" ? identifier(value.traceId, "traceId") : undefined;
	if (action !== "capture" && value.traceId !== undefined) {
		throw new Error("Preview traceId is supported only for capture.");
	}
	const expectedProfileDigest = optionalDigest(value.expectedProfileDigest);
	return {
		action,
		profileId,
		...(traceId ? { traceId } : {}),
		...(expectedProfileDigest ? { expectedProfileDigest } : {}),
	};
}

function assertExpectedDigest(
	statuses: PreviewRuntimeStatus[],
	command: DashboardPreviewCommand,
): void {
	if (!command.expectedProfileDigest) return;
	const status = statuses.find(
		(candidate) => candidate.profileId === command.profileId,
	);
	if (
		!status?.profileDigest ||
		status.profileDigest !== command.expectedProfileDigest
	) {
		throw new Error(
			"Preview profile changed; refresh the dashboard before retrying.",
		);
	}
}

function identifier(value: unknown, field: "profileId" | "traceId"): string {
	if (
		typeof value !== "string" ||
		!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/.test(value.trim())
	) {
		throw new Error(`Preview ${field} must be a bounded safe identifier.`);
	}
	return value.trim();
}

function optionalDigest(value: unknown): string | undefined {
	if (value === undefined) return undefined;
	if (typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value)) {
		return value;
	}
	throw new Error(
		"Preview expectedProfileDigest must be an exact sha256 digest.",
	);
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
