import type {CheckCatalog} from "../catalog.ts";
import {canonicalJsonDigest} from "../../utils/canonical-json.ts";
import {
	createUserStandardDistillationRequest,
	runUserStandardDistillation,
	type UserStandardDefaultCheckDescriptor,
	type UserStandardDistillationReceipt,
	type UserStandardDistillationRoute,
	type UserStandardDistiller,
} from "./distillation.ts";
import {
	createUserStandardSourceRequest,
	retrieveUserStandardSource,
	type UserStandardSourceReceipt,
	type UserStandardSourceSelection,
	type UserStandardUrlRetriever,
} from "./source-retrieval.ts";
import {compareCanonicalText as compareText} from "./validation.ts";

export interface UserStandardDistillationRuntimeResult {
	readonly sourceReceipt: UserStandardSourceReceipt;
	readonly distillationReceipt: UserStandardDistillationReceipt | null;
}

export interface UserStandardDistillationRuntime {
	readonly distill: (input: {
		readonly name: string;
		readonly source: UserStandardSourceSelection;
		readonly signal?: AbortSignal;
	}) => Promise<UserStandardDistillationRuntimeResult>;
}

export function createUserStandardDistillationRuntime(options: {
	readonly catalog: CheckCatalog;
	readonly route: UserStandardDistillationRoute;
	readonly distiller: UserStandardDistiller;
	readonly urlRetriever?: UserStandardUrlRetriever;
	readonly now?: () => Date;
}): UserStandardDistillationRuntime {
	const defaultChecks = defaultCheckDescriptors(options.catalog);
	return Object.freeze({
		async distill(
			input: Parameters<UserStandardDistillationRuntime["distill"]>[0],
		) {
			const sourceRequest = createUserStandardSourceRequest(input.source);
			const sourceReceipt = await retrieveUserStandardSource({
				request: sourceRequest,
				...(options.urlRetriever ? {urlRetriever: options.urlRetriever} : {}),
				...(options.now ? {now: options.now} : {}),
				...(input.signal ? {signal: input.signal} : {}),
			});
			if (sourceReceipt.status !== "retrieved") {
				return Object.freeze({sourceReceipt, distillationReceipt: null});
			}
			const request = createUserStandardDistillationRequest({
				name: input.name,
				sourceReceipt,
				defaultChecks,
				route: options.route,
			});
			const distillationReceipt = await runUserStandardDistillation({
				request,
				distiller: options.distiller,
				...(options.now ? {now: options.now} : {}),
				...(input.signal ? {signal: input.signal} : {}),
			});
			return Object.freeze({sourceReceipt, distillationReceipt});
		},
	});
}

function defaultCheckDescriptors(
	catalog: CheckCatalog,
): UserStandardDefaultCheckDescriptor[] {
	const descriptors: UserStandardDefaultCheckDescriptor[] = [];
	for (const registration of catalog.list()) {
		if (registration.authority !== "kernel") continue;
		descriptors.push({
			id: registration.check.id,
			version: registration.check.version,
			digest: canonicalJsonDigest(registration.check),
			description: registration.check.description,
			requirement: registration.check.requirement,
			loops: [...registration.loops],
		});
	}
	const seen = new Set<string>();
	for (const descriptor of descriptors) {
		if (seen.has(descriptor.id)) {
			throw new Error(`Default Check ${descriptor.id} has duplicate Catalog registration.`);
		}
		seen.add(descriptor.id);
	}
	return descriptors.sort((...values) => compareText(values[0].id, values[1].id));
}
