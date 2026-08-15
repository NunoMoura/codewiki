import {
	createGateRunner,
	type CheckExecutor,
	type CheckInputResolver,
	type CreateGateRunnerInput,
	type GateRunner,
} from "./runner.ts";
import {
	InMemoryCheckResultCache,
	type CheckResultCache,
} from "./cache.ts";

export interface Checks {
	readonly cache: CheckResultCache;
	createRunner(input?: Omit<CreateGateRunnerInput, "cache">): GateRunner;
}

export interface CreateChecksInput {
	readonly cache?: CheckResultCache;
	readonly executors?: readonly CheckExecutor[];
	readonly inputResolver?: CheckInputResolver;
}

export function createChecks(input: CreateChecksInput = {}): Checks {
	const cache = input.cache ?? new InMemoryCheckResultCache();
	return Object.freeze({
		cache,
		createRunner: (runnerInput: Omit<CreateGateRunnerInput, "cache"> = {}) =>
			createGateRunner({
				cache,
				executors: runnerInput.executors ?? input.executors,
				inputResolver: runnerInput.inputResolver ?? input.inputResolver,
				limits: runnerInput.limits,
			}),
	});
}

export {
	createGateRunner,
	InMemoryCheckResultCache,
	type CheckExecutor,
	type CheckInputResolver,
	type CheckResultCache,
	type CreateGateRunnerInput,
	type GateRunner,
};
