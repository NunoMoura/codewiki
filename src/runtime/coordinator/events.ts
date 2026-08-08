import type { ProjectCoordinatorEvent } from "./project.ts";

export const PROJECT_COORDINATOR_EVENT_STREAM_SCHEMA_VERSION = 1 as const;

export interface ProjectCoordinatorStreamEvent extends ProjectCoordinatorEvent {
	cursor: number;
}

export interface ProjectCoordinatorEventBatch {
	schemaVersion: typeof PROJECT_COORDINATOR_EVENT_STREAM_SCHEMA_VERSION;
	generationId: string;
	latestCursor: number;
	cursor: number;
	resetRequired: boolean;
	events: ProjectCoordinatorStreamEvent[];
}

export interface ProjectCoordinatorEventPoll {
	afterCursor: number;
	maxEvents?: number;
	waitMs?: number;
}

interface EventWaiter {
	resolve(): void;
	timer: NodeJS.Timeout;
}

export class ProjectCoordinatorEventJournal {
	readonly generationId: string;
	private readonly maxRetainedEvents: number;
	private readonly events: ProjectCoordinatorStreamEvent[] = [];
	private readonly waiters = new Set<EventWaiter>();
	private nextCursor = 1;
	private closed = false;

	constructor(generationId: string, maxRetainedEvents = 512) {
		this.generationId = generationId;
		this.maxRetainedEvents = maxRetainedEvents;
		if (!generationId.trim()) throw new Error("generationId is required.");
		if (
			!Number.isInteger(maxRetainedEvents) ||
			maxRetainedEvents < 16 ||
			maxRetainedEvents > 4_096
		) {
			throw new Error("maxRetainedEvents must be an integer from 16 to 4096.");
		}
	}

	append(event: ProjectCoordinatorEvent): ProjectCoordinatorStreamEvent {
		if (this.closed) throw new Error("Project coordinator event journal is closed.");
		if (event.generationId !== this.generationId) {
			throw new Error("Project coordinator event generation does not match journal.");
		}
		const streamed = Object.freeze({ ...event, cursor: this.nextCursor++ });
		this.events.push(streamed);
		const overflow = this.events.length - this.maxRetainedEvents;
		if (overflow > 0) this.events.splice(0, overflow);
		this.wake();
		return streamed;
	}

	async poll(input: ProjectCoordinatorEventPoll): Promise<ProjectCoordinatorEventBatch> {
		if (this.closed) throw new Error("Project coordinator event journal is closed.");
		const afterCursor = boundedInteger(
			input.afterCursor,
			0,
			Number.MAX_SAFE_INTEGER,
			"afterCursor",
		);
		const maxEvents = boundedInteger(input.maxEvents ?? 100, 1, 256, "maxEvents");
		const waitMs = boundedInteger(input.waitMs ?? 0, 0, 25_000, "waitMs");
		let batch = this.batch(afterCursor, maxEvents);
		if (
			!this.closed &&
			!batch.resetRequired &&
			batch.events.length === 0 &&
			waitMs > 0
		) {
			await this.wait(waitMs);
			if (this.closed) {
				throw new Error("Project coordinator event journal is closed.");
			}
			batch = this.batch(afterCursor, maxEvents);
		}
		return batch;
	}

	close(): void {
		if (this.closed) return;
		this.closed = true;
		this.wake();
	}

	private batch(afterCursor: number, maxEvents: number): ProjectCoordinatorEventBatch {
		const latestCursor = this.nextCursor - 1;
		const oldestCursor = this.events[0]?.cursor ?? this.nextCursor;
		const resetRequired =
			afterCursor > latestCursor || afterCursor < oldestCursor - 1;
		const events = resetRequired
			? []
			: this.events
					.filter((event) => event.cursor > afterCursor)
					.slice(0, maxEvents);
		return {
			schemaVersion: PROJECT_COORDINATOR_EVENT_STREAM_SCHEMA_VERSION,
			generationId: this.generationId,
			latestCursor,
			cursor: resetRequired ? latestCursor : (events.at(-1)?.cursor ?? afterCursor),
			resetRequired,
			events,
		};
	}

	private wait(waitMs: number): Promise<void> {
		return new Promise((resolve) => {
			const waiter = {
				resolve: () => {
					clearTimeout(waiter.timer);
					this.waiters.delete(waiter);
					resolve();
				},
				timer: undefined as unknown as NodeJS.Timeout,
			};
			waiter.timer = setTimeout(waiter.resolve, waitMs);
			this.waiters.add(waiter);
		});
	}

	private wake(): void {
		for (const waiter of [...this.waiters]) waiter.resolve();
	}
}

function boundedInteger(
	value: number,
	minimum: number,
	maximum: number,
	field: string,
): number {
	if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
		throw new Error(`${field} must be an integer from ${minimum} to ${maximum}.`);
	}
	return value;
}
