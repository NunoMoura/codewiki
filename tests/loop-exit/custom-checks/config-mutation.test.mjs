import assert from "node:assert/strict";
import {execFile} from "node:child_process";
import {mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {promisify} from "node:util";
import {describe, it} from "node:test";

import {
	activateCustomCheckDefinition,
	CUSTOM_CHECK_MUTATION_PROTOCOL,
	createCustomCheckConfigState,
	createCustomCheckDefinition,
	createCustomCheckMutationRuntime,
	createProtectedCustomCheckConfigSnapshot,
	createWikiConfigCustomCheckStore,
	disableCustomCheckDefinition,
	loadProtectedCustomCheckConfigSnapshot,
	parseCustomCheckMutationCommand,
} from "../../../src/loop-exit/custom-checks/index.ts";
import {resolveExitPolicy} from "../../../src/loop-exit/resolve-policy.ts";
import {
	loadWikiConfigFile,
	writeWikiConfigFile,
} from "../../../src/project/config-file.ts";
import {wikiConfigDigest} from "../../../src/project/config-digest.ts";
import {resolveWikiConfig} from "../../../src/project/config.ts";
import {canonicalJsonDigest} from "../../../src/utils/canonical-json.ts";
import {
	createTestUserStandard,
	standardRefsFor,
} from "./user-standard-fixture.mjs";

const USER_STANDARD = createTestUserStandard();
const USER_STANDARDS = [USER_STANDARD];
const execFileAsync = promisify(execFile);
const SOURCE_HEAD = "f".repeat(40);
const CHANGE_DIGEST = `sha256:${"b".repeat(64)}`;
const CANDIDATE_DIGEST = `sha256:${"c".repeat(64)}`;

function proposal(overrides = {}) {
	return {
		checkTypeId: "organization_policy",
		name: "Public API ownership",
		requirement: "Every changed public API names its accountable owning team.",
		repairGuidance: "Add one accepted owning-team reference.",
		appliesWhen: {loops: ["decision"]},
		standardRefs: standardRefsFor(USER_STANDARD),
		knowledgeRefs: ["knowledge:api-ownership"],
		...overrides,
	};
}

function authority(overrides = {}) {
	return {
		actorId: "maintainer-1",
		principalRef: "identity:maintainer-1",
		role: "maintainer",
		actorPolicyDigest: `sha256:${"1".repeat(64)}`,
		authenticationEvidenceId: "auth:test:maintainer-1",
		runtimeProtocolDigest: `sha256:${"2".repeat(64)}`,
		...overrides,
	};
}

function stateFor(customChecks, userStandards = USER_STANDARDS) {
	return createCustomCheckConfigState({
		projectConfigDigest: canonicalJsonDigest({
			project: "test",
			userStandards,
			customChecks,
		}),
		userStandards,
		customChecks,
	});
}

function memoryStore(initialCustomChecks = []) {
	let state = stateFor(initialCustomChecks);
	let writes = 0;
	return {
		store: {
			async load() {
				return state;
			},
			async preview(input) {
				assert.equal(input.current.projectConfigDigest, state.projectConfigDigest);
				return stateFor(input.customChecks, input.userStandards);
			},
			async compareAndSwap(input) {
				if (input.expectedConfigDigest !== state.projectConfigDigest) {
					throw new Error("stale memory configuration");
				}
				const next = stateFor(input.customChecks, input.userStandards);
				assert.equal(next.projectConfigDigest, input.expectedNextConfigDigest);
				state = next;
				writes += 1;
				return state;
			},
		},
		current: () => state,
		writes: () => writes,
	};
}

function protectedBase(customChecks = [], projectConfigDigest = stateFor(customChecks).projectConfigDigest) {
	return createProtectedCustomCheckConfigSnapshot({
		protectedSourceHead: SOURCE_HEAD,
		projectConfigDigest,
		userStandards: USER_STANDARDS,
		customChecks,
	});
}

function command(action, current, protectedSnapshot, fields = {}) {
	return {
		protocolId: CUSTOM_CHECK_MUTATION_PROTOCOL.id,
		protocolVersion: CUSTOM_CHECK_MUTATION_PROTOCOL.version,
		action,
		idempotencyKey: `custom-check-${action}-${crypto.randomUUID()}`,
		expectedConfigDigest: current.projectConfigDigest,
		expectedProtectedSourceHead: protectedSnapshot.protectedSourceHead,
		expectedProtectedConfigDigest: protectedSnapshot.projectConfigDigest,
		...fields,
	};
}

function policyInput(protectedBaseCustomCheckConfig) {
	return {
		loop: "decision",
		candidateDigest: CANDIDATE_DIGEST,
		changes: [
			{
				changeId: "CHG-custom-check-policy",
				revision: 1,
				digest: CHANGE_DIGEST,
				kind: "improve",
				type: "behavior_change",
				risk: "low",
				affectedLayers: ["api"],
			},
		],
		projectTraits: [],
		technologies: [],
		paths: ["src/api/users.ts"],
		protectedBaseCustomCheckConfig,
	};
}

describe("guarded Custom Check configuration mutations", () => {
	it("creates, activates, updates, and disables through authenticated exact CAS", async () => {
		const memory = memoryStore();
		const protectedSnapshot = protectedBase();
		const authorizations = [];
		const runtime = createCustomCheckMutationRuntime({
			store: memory.store,
			loadProtectedBase: async () => protectedSnapshot,
			authorize(request) {
				authorizations.push(request);
				return request.authority.role === "maintainer";
			},
			now: () => new Date("2026-08-01T12:00:00.000Z"),
		});

		const created = await runtime.execute(
			command("create", memory.current(), protectedSnapshot, {
				proposal: proposal(),
			}),
			authority(),
		);
		assert.equal(created.definition.lifecycle, "draft");
		assert.equal(created.receipt.effectiveFrom, "next_protected_snapshot");
		assert.equal(
			created.receipt.protectedBaseSnapshotDigest,
			protectedSnapshot.snapshotDigest,
		);
		assert.equal(created.receipt.configDigestAfter, memory.current().projectConfigDigest);

		const activated = await runtime.execute(
			command("activate", memory.current(), protectedSnapshot, {
				customCheckId: created.definition.customCheckId,
			}),
			authority(),
		);
		assert.equal(activated.definition.lifecycle, "active");
		assert.equal(
			activated.definition.definitionDigest,
			created.definition.definitionDigest,
		);

		const updated = await runtime.execute(
			command("update", memory.current(), protectedSnapshot, {
				customCheckId: created.definition.customCheckId,
				proposal: proposal({
					requirement:
						"Every changed public API names its accountable team and escalation owner.",
				}),
			}),
			authority(),
		);
		assert.equal(updated.definition.lifecycle, "active");
		assert.equal(updated.definition.customCheckId, created.definition.customCheckId);
		assert.notEqual(
			updated.definition.definitionDigest,
			created.definition.definitionDigest,
		);

		const disabled = await runtime.execute(
			command("disable", memory.current(), protectedSnapshot, {
				customCheckId: created.definition.customCheckId,
			}),
			authority(),
		);
		assert.equal(disabled.definition.lifecycle, "disabled");
		assert.equal(disabled.definition.definitionDigest, updated.definition.definitionDigest);
		assert.equal(memory.writes(), 4);
		assert.deepEqual(
			authorizations.map((entry) => entry.command.action),
			["create", "activate", "update", "disable"],
		);
		assert.ok(
			authorizations.every(
				(entry) =>
					entry.authorizationDigest.startsWith("sha256:") &&
					entry.protectedBase.snapshotDigest === protectedSnapshot.snapshotDigest,
			),
		);
	});

	it("rejects stale, unauthorized, malformed, and conflicting idempotent commands", async () => {
		const memory = memoryStore();
		const protectedSnapshot = protectedBase();
		let authorized = false;
		const runtime = createCustomCheckMutationRuntime({
			store: memory.store,
			loadProtectedBase: async () => protectedSnapshot,
			authorize: () => authorized,
		});
		const createCommand = command("create", memory.current(), protectedSnapshot, {
			idempotencyKey: "create-policy-check",
			proposal: proposal(),
		});

		await assert.rejects(
			() => runtime.execute(createCommand, authority()),
			(error) => error.code === "forbidden",
		);
		assert.equal(memory.writes(), 0);

		authorized = true;
		const created = await runtime.execute(createCommand, authority());
		const replayed = await runtime.execute(createCommand, authority());
		assert.equal(replayed.replayed, true);
		assert.equal(replayed.receipt.receiptId, created.receipt.receiptId);
		assert.equal(memory.writes(), 1);

		await assert.rejects(
			() =>
				runtime.execute(
					{
						...createCommand,
						proposal: proposal({name: "Different policy"}),
					},
					authority(),
				),
			(error) => error.code === "conflict" && /different input/.test(error.message),
		);
		await assert.rejects(
			() =>
				runtime.execute(
					command("disable", stateFor([]), protectedSnapshot, {
						customCheckId: created.definition.customCheckId,
					}),
					authority(),
				),
			(error) => error.code === "conflict" && /configuration changed/.test(error.message),
		);

		assert.throws(
			() =>
				parseCustomCheckMutationCommand({
					...createCommand,
					protocolVersion: "1.0.0",
				}),
			/protocolVersion is invalid/,
		);
		assert.throws(
			() => parseCustomCheckMutationCommand({...createCommand, revision: 2}),
			/unsupported field revision/,
		);
		assert.throws(
			() =>
				parseCustomCheckMutationCommand({
					...createCommand,
					proposal: {...proposal(), definitionDigest: `sha256:${"9".repeat(64)}`},
				}),
			/unsupported field definitionDigest/,
		);
		await assert.rejects(
			() =>
				runtime.execute(
					command("activate", memory.current(), protectedSnapshot, {
						customCheckId: created.definition.customCheckId,
					}),
					{...authority(), authenticationEvidenceId: ""},
				),
			(error) => error.code === "bad_request" && /authenticationEvidenceId/.test(error.message),
		);

		const movingMemory = memoryStore();
		const movedProtectedSnapshot = createProtectedCustomCheckConfigSnapshot({
			protectedSourceHead: "e".repeat(40),
			projectConfigDigest: protectedSnapshot.projectConfigDigest,
			userStandards: USER_STANDARDS,
			customChecks: [],
		});
		let protectedLoads = 0;
		const movingRuntime = createCustomCheckMutationRuntime({
			store: movingMemory.store,
			loadProtectedBase: async () =>
				protectedLoads++ === 0 ? protectedSnapshot : movedProtectedSnapshot,
			authorize: () => true,
		});
		await assert.rejects(
			() =>
				movingRuntime.execute(
					command("create", movingMemory.current(), protectedSnapshot, {
						proposal: proposal(),
					}),
					authority(),
				),
			(error) =>
				error.code === "conflict" && /changed during authorization/.test(error.message),
		);
		assert.equal(movingMemory.writes(), 0);
	});

	it("keeps protected-base Checks active while a disabling config change is pending", async () => {
		const active = activateCustomCheckDefinition(
			createCustomCheckDefinition(proposal(), USER_STANDARDS),
			USER_STANDARDS,
		);
		const memory = memoryStore([active]);
		const protectedSnapshot = protectedBase(
			[active],
			memory.current().projectConfigDigest,
		);
		const runtime = createCustomCheckMutationRuntime({
			store: memory.store,
			loadProtectedBase: async () => protectedSnapshot,
			authorize: () => true,
		});

		const disabled = await runtime.execute(
			command("disable", memory.current(), protectedSnapshot, {
				customCheckId: active.customCheckId,
			}),
			authority(),
		);
		assert.equal(disabled.definition.lifecycle, "disabled");
		const currentPolicy = resolveExitPolicy(policyInput(protectedSnapshot));
		assert.throws(
			() =>
				resolveExitPolicy(
					policyInput({
						...protectedSnapshot,
						snapshotDigest: `sha256:${"0".repeat(64)}`,
					}),
				),
			/snapshot digest does not match/,
		);
		assert.ok(
			currentPolicy.bindings.some(
				(binding) => binding.parameters.customCheckId === active.customCheckId,
			),
		);

		const nextProtectedSnapshot = createProtectedCustomCheckConfigSnapshot({
			protectedSourceHead: "e".repeat(40),
			projectConfigDigest: disabled.state.projectConfigDigest,
			userStandards: disabled.state.userStandards,
			customChecks: disabled.state.customChecks,
		});
		const nextPolicy = resolveExitPolicy(policyInput(nextProtectedSnapshot));
		assert.ok(
			!nextPolicy.bindings.some(
				(binding) => binding.parameters.customCheckId === active.customCheckId,
			),
		);
	});

	it("loads policy from an exact Git head while file CAS prepares the next snapshot", async () => {
		const root = await mkdtemp(join(tmpdir(), "codewiki-custom-check-config-"));
		try {
			await execFileAsync("git", ["init", "-q", root]);
			await execFileAsync("git", ["-C", root, "config", "user.name", "CodeWiki Test"]);
			await execFileAsync("git", ["-C", root, "config", "user.email", "test@codewiki.local"]);
			const active = activateCustomCheckDefinition(
				createCustomCheckDefinition(proposal(), USER_STANDARDS),
				USER_STANDARDS,
			);
			const config = resolveWikiConfig({
				project: "protected-test",
				userStandards: USER_STANDARDS,
				customChecks: [active],
			});
			await writeWikiConfigFile(root, config);
			await execFileAsync("git", ["-C", root, "add", ".codewiki/config.json"]);
			await execFileAsync("git", ["-C", root, "commit", "-q", "-m", "protected config"]);
			const {stdout} = await execFileAsync("git", ["-C", root, "rev-parse", "HEAD"]);
			const head = stdout.trim();
			const protectedSnapshot = await loadProtectedCustomCheckConfigSnapshot({
				repoRoot: root,
				protectedSourceHead: head,
			});
			assert.equal(protectedSnapshot.projectConfigDigest, wikiConfigDigest(config));
			assert.equal(protectedSnapshot.customChecks[0].lifecycle, "active");

			const store = createWikiConfigCustomCheckStore(root);
			const before = await store.load();
			const disabled = disableCustomCheckDefinition(active, USER_STANDARDS);
			const preview = await store.preview({
				current: before,
				userStandards: USER_STANDARDS,
				customChecks: [disabled],
			});
			const after = await store.compareAndSwap({
				expectedConfigDigest: before.projectConfigDigest,
				expectedNextConfigDigest: preview.projectConfigDigest,
				userStandards: USER_STANDARDS,
				customChecks: [disabled],
			});
			assert.equal(after.customChecks[0].lifecycle, "disabled");
			assert.equal((await loadWikiConfigFile(root)).customChecks[0].lifecycle, "disabled");

			const stillProtected = await loadProtectedCustomCheckConfigSnapshot({
				repoRoot: root,
				protectedSourceHead: head,
			});
			assert.equal(stillProtected.customChecks[0].lifecycle, "active");
			await assert.rejects(
				() =>
					store.compareAndSwap({
						expectedConfigDigest: before.projectConfigDigest,
						expectedNextConfigDigest: preview.projectConfigDigest,
						userStandards: USER_STANDARDS,
						customChecks: [disabled],
					}),
				(error) => error.code === "conflict" && /changed before/.test(error.message),
			);
		} finally {
			await rm(root, {recursive: true, force: true});
		}
	});
});
