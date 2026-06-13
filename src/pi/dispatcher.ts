import type { TraceEvent } from "../traces/types.ts";
import type {
	RuntimeDispatchItem,
	RuntimeDispatchPlan,
} from "../runtime/scheduler.ts";

export interface PiWorkerSession {
	prompt(text: string, options?: unknown): Promise<void>;
	dispose?(): void | Promise<void>;
	sessionId?: string;
	sessionFile?: string;
}

export interface PiWorkerSessionFactory {
	create(input: PiWorkerSessionInput): Promise<PiWorkerSession>;
}

export interface PiWorkerSessionInput {
	workerId: string;
	workUnitId: string;
	traceId: string;
	planningRefs: string[];
	pathScopes: string[];
	componentRefs: string[];
	prompt: string;
}

export interface PiWorkerDispatchOptions {
	claimEvents: TraceEvent[];
	sessionFactory: PiWorkerSessionFactory;
	promptPrefix?: string;
	promptSuffix?: string;
	disposeSessions?: boolean;
	promptOptions?: unknown;
}

export interface PiWorkerDispatchResult {
	workUnitId: string;
	workerId: string;
	traceId: string;
	planningRefs: string[];
	sessionId?: string;
	sessionFile?: string;
	status: "started" | "failed";
	error?: string;
}

export async function dispatchPiWorkers(
	plan: RuntimeDispatchPlan,
	options: PiWorkerDispatchOptions,
): Promise<PiWorkerDispatchResult[]> {
	const workerIds = workerIdsByWorkUnit(options.claimEvents);
	return Promise.all(
		plan.dispatch.map((item) =>
			dispatchPiWorker({
				item,
				workerId: workerIds.get(item.workUnitId) || item.workUnitId,
				options,
			}),
		),
	);
}

export function createPiWorkerPrompt(
	item: RuntimeDispatchItem,
	options: Pick<PiWorkerDispatchOptions, "promptPrefix" | "promptSuffix"> = {},
): string {
	return [
		options.promptPrefix,
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
		``,
		`Rules:`,
		`- Stay inside assigned path scopes unless you must report a blocker.`,
		`- Worker owns local TDD: write or update tests, show red evidence when required, then make green.`,
		`- Map checks and acceptance evidence to planning acceptance criterion ids.`,
		`- Do not close the implementation loop; submit evidence for the aggregate exit.`,
		`- Keep trace refs canonical; commands and prose belong in evidence data, not refs.`,
		options.promptSuffix,
	]
		.filter((line): line is string => typeof line === "string")
		.join("\n");
}

async function dispatchPiWorker(input: {
	item: RuntimeDispatchItem;
	workerId: string;
	options: PiWorkerDispatchOptions;
}): Promise<PiWorkerDispatchResult> {
	const prompt = createPiWorkerPrompt(input.item, input.options);
	let session: PiWorkerSession | undefined;
	try {
		session = await input.options.sessionFactory.create({
			workerId: input.workerId,
			workUnitId: input.item.workUnitId,
			traceId: input.item.traceId,
			planningRefs: input.item.planningRefs,
			pathScopes: input.item.pathScopes,
			componentRefs: input.item.componentRefs,
			prompt,
		});
		await session.prompt(prompt, input.options.promptOptions);
		return {
			workUnitId: input.item.workUnitId,
			workerId: input.workerId,
			traceId: input.item.traceId,
			planningRefs: [...input.item.planningRefs],
			...(session.sessionId ? { sessionId: session.sessionId } : {}),
			...(session.sessionFile ? { sessionFile: session.sessionFile } : {}),
			status: "started",
		};
	} catch (error) {
		return {
			workUnitId: input.item.workUnitId,
			workerId: input.workerId,
			traceId: input.item.traceId,
			planningRefs: [...input.item.planningRefs],
			status: "failed",
			error: errorMessage(error),
		};
	} finally {
		if (input.options.disposeSessions) await session?.dispose?.();
	}
}

function workerIdsByWorkUnit(claimEvents: TraceEvent[]): Map<string, string> {
	const workerIds = new Map<string, string>();
	for (const event of claimEvents) {
		const workUnitId = text(event.data?.workUnitId);
		const workerId = text(event.data?.workerId);
		if (workUnitId && workerId) workerIds.set(workUnitId, workerId);
	}
	return workerIds;
}

function bulletList(values: string[]): string[] {
	return values.length > 0 ? values.map((value) => `- ${value}`) : ["- none"];
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function text(value: unknown): string {
	return String(value || "").trim();
}
