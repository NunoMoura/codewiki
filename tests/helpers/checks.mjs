import {canonicalJsonDigest} from "../../src/utils/canonical-json.ts";
import {
	CHECK_OUTPUT_PROTOCOL_ID,
	CHECK_OUTPUT_PROTOCOL_VERSION,
} from "../../src/checks/contracts.ts";
import {createCheckSubject} from "../../src/checks/identity.ts";
import {
	createCheckPack,
	createCheckPackSnapshot,
	createPackSkillSetSnapshot,
	createPackagedCheck,
} from "../../src/checks/packs/contracts.ts";
import {bindProducerSkills} from "../../src/runtime/contracts.ts";

export function digest(value) {
	return canonicalJsonDigest(value);
}

export function producerSkills(stage = "implementation") {
	return bindProducerSkills(
		createPackSkillSetSnapshot({stage, skills: []}),
		stage,
	);
}

export function checkDefinition(overrides = {}) {
	const implementation = overrides.implementation ?? {
		kind: "code",
		profile: "sandbox",
	};
	return {
		schemaVersion: "1.0.0",
		id: overrides.id ?? "check-one",
		version: overrides.version ?? "1.0.0",
		description: overrides.description ?? "Checks one bounded requirement.",
		requirement: overrides.requirement ?? "Subject must satisfy requirement.",
		implementation,
		inputs: overrides.inputs ?? [
			{source: "subject", refs: [], required: true, maximumBytes: 65_536},
		],
		measurement: overrides.measurement ?? {kind: "binary"},
		failure: overrides.failure ?? {
			code: "requirement_not_met",
			message: "Requirement is not met.",
			remediation: ["Update subject and rerun Check."],
		},
		limits: overrides.limits ?? {
			timeoutMs: 1_000,
			maximumAttempts: 1,
			maximumInputBytes: 131_072,
			maximumOutputBytes: 65_536,
		},
	};
}

export function packagedCheck(overrides = {}) {
	const definition = checkDefinition(overrides.definition ?? overrides);
	const fileName =
		definition.implementation.kind === "code" ? "CHECK.mjs" : "CHECK.md";
	return createPackagedCheck({
		stage: overrides.stage ?? "decision",
		packId: overrides.packId ?? "default",
		checkId: definition.id,
		definition,
		implementationFileName: fileName,
		implementationContent:
			overrides.implementationContent ??
			(fileName === "CHECK.mjs"
				? "export default async function check() { return true; }\n"
				: [
						"# Requirement",
						"Evaluate exact bounded subject.",
						"# Pass",
						"Requirement is satisfied by supplied input.",
						"# Fail",
						"Requirement is not satisfied by supplied input.",
						"# Feedback",
						"State the missing or contradictory supplied fact.",
					].join("\n")),
	});
}

export function checkSnapshot(checks = [packagedCheck()], overrides = {}) {
	return createCheckPackSnapshot({
		stage: overrides.stage ?? checks[0]?.stage ?? "decision",
		packs:
			overrides.packs ??
			[createCheckPack({id: overrides.packId ?? "default", checks})],
	});
}

export function checkSubject(overrides = {}) {
	return createCheckSubject({
		stage: overrides.stage ?? "decision",
		id: overrides.id ?? "subject:one",
		schemaVersion: overrides.schemaVersion ?? "1.0.0",
		content: overrides.content ?? {value: "subject"},
	});
}

export function executionIdentity(overrides = {}) {
	const kind = overrides.kind ?? "code";
	return {
		kind,
		executorId: overrides.executorId ?? `${kind}-executor`,
		executorVersion: overrides.executorVersion ?? "1.0.0",
		profile: overrides.profile ?? "sandbox",
		...(kind === "model" ? {route: overrides.route ?? "model-route"} : {}),
		configurationDigest: overrides.configurationDigest ?? digest({kind, config: 1}),
	};
}

export function checkOutput(invocation, overrides = {}) {
	return {
		protocolId: CHECK_OUTPUT_PROTOCOL_ID,
		protocolVersion: CHECK_OUTPUT_PROTOCOL_VERSION,
		invocationDigest: invocation.invocationDigest,
		measurement: overrides.measurement ?? {kind: "binary", value: true},
		summary: overrides.summary ?? "Requirement satisfied.",
		details: overrides.details ?? [],
	};
}

export function checkExecutor(overrides = {}) {
	const identity = executionIdentity(overrides.identity ?? overrides);
	return {
		identity,
		supports: overrides.supports ?? (() => true),
		execute:
			overrides.execute ??
			((context) => checkOutput(context.invocation, overrides.output ?? {})),
	};
}
