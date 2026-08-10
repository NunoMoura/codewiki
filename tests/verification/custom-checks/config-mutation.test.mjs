import assert from "node:assert/strict";
import {execFile} from "node:child_process";
import {mkdir, mkdtemp, rm, symlink, writeFile} from "node:fs/promises";
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
	discoverProjectCheckPacks,
	loadProjectCheckPacks,
	loadProtectedCustomCheckConfigSnapshot,
	parseCustomCheckMutationCommand,
} from "../../../src/verification/custom-checks/index.ts";
import {createCheckCatalog} from "../../../src/verification/catalog.ts";
import {resolveExitPolicy} from "../../../src/verification/resolve-policy.ts";
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
		evaluator: "model",
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

function stateFor(
	customChecks,
	userStandards = USER_STANDARDS,
	triagePreferences = [],
) {
	return createCustomCheckConfigState({
		projectConfigDigest: canonicalJsonDigest({
			project: "test",
			userStandards,
			triagePreferences,
			customChecks,
		}),
		userStandards,
		triagePreferences,
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
				return stateFor(
					input.customChecks,
					input.userStandards,
					input.triagePreferences,
				);
			},
			async compareAndSwap(input) {
				if (input.expectedConfigDigest !== state.projectConfigDigest) {
					throw new Error("stale memory configuration");
				}
				const next = stateFor(
					input.customChecks,
					input.userStandards,
					input.triagePreferences,
				);
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
		triagePreferences: [],
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
		assert.equal(created.changedCustomChecks[0].lifecycle, "draft");
		assert.equal(created.receipt.effectiveFrom, "next_protected_snapshot");
		assert.equal(created.receipt.protocolVersion, "5.0.0");
		assert.equal(created.receipt.distillationReceipt, null);
		assert.deepEqual(created.receipt.selectedProposalIds, []);
		assert.deepEqual(created.receipt.standardChanges, []);
		assert.equal(created.receipt.definitionChanges.length, 1);
		assert.equal(Object.hasOwn(created.receipt, "definitionAfter"), false);
		assert.equal(
			created.receipt.protectedBaseSnapshotDigest,
			protectedSnapshot.snapshotDigest,
		);
		assert.equal(created.receipt.configDigestAfter, memory.current().projectConfigDigest);

		const activated = await runtime.execute(
			command("activate", memory.current(), protectedSnapshot, {
				customCheckId: created.changedCustomChecks[0].customCheckId,
			}),
			authority(),
		);
		assert.equal(activated.changedCustomChecks[0].lifecycle, "active");
		assert.equal(
			activated.changedCustomChecks[0].definitionDigest,
			created.changedCustomChecks[0].definitionDigest,
		);

		const updated = await runtime.execute(
			command("update", memory.current(), protectedSnapshot, {
				customCheckId: created.changedCustomChecks[0].customCheckId,
				proposal: proposal({
					requirement:
						"Every changed public API names its accountable team and escalation owner.",
				}),
			}),
			authority(),
		);
		assert.equal(updated.changedCustomChecks[0].lifecycle, "active");
		assert.equal(updated.changedCustomChecks[0].customCheckId, created.changedCustomChecks[0].customCheckId);
		assert.notEqual(
			updated.changedCustomChecks[0].definitionDigest,
			created.changedCustomChecks[0].definitionDigest,
		);

		const disabled = await runtime.execute(
			command("disable", memory.current(), protectedSnapshot, {
				customCheckId: created.changedCustomChecks[0].customCheckId,
			}),
			authority(),
		);
		assert.equal(disabled.changedCustomChecks[0].lifecycle, "disabled");
		assert.equal(disabled.changedCustomChecks[0].definitionDigest, updated.changedCustomChecks[0].definitionDigest);
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
						customCheckId: created.changedCustomChecks[0].customCheckId,
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
						customCheckId: created.changedCustomChecks[0].customCheckId,
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
			triagePreferences: [],
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
		assert.equal(disabled.changedCustomChecks[0].lifecycle, "disabled");
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
			triagePreferences: disabled.state.triagePreferences,
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
				triagePreferences: before.triagePreferences,
				customChecks: [disabled],
			});
			const after = await store.compareAndSwap({
				expectedConfigDigest: before.projectConfigDigest,
				expectedNextConfigDigest: preview.projectConfigDigest,
				userStandards: USER_STANDARDS,
				triagePreferences: before.triagePreferences,
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
						triagePreferences: before.triagePreferences,
						customChecks: [disabled],
					}),
				(error) => error.code === "conflict" && /changed before/.test(error.message),
			);
		} finally {
			await rm(root, {recursive: true, force: true});
		}
	});
});

async function createCheckPackProject(input = {}) {
	const root = await mkdtemp(join(tmpdir(), "codewiki-check-pack-"));
	const projectChecks = input.projectChecks ?? {};
	await writeWikiConfigFile(root, resolveWikiConfig({checks: projectChecks}));
	const packRoot = join(
		root,
		".codewiki",
		"check-packs",
		input.bindingId ?? "team-policy",
	);
	await mkdir(join(packRoot, "checks"), {recursive: true});
	await writeFile(
		join(packRoot, "config.json"),
		`${JSON.stringify(input.packConfig ?? {defaults: {}}, null, 2)}\n`,
	);
	for (const check of input.checks ?? []) {
		const checkRoot = join(packRoot, "checks", check.id);
		await mkdir(checkRoot, {recursive: true});
		for (const [name, source] of Object.entries(check.files)) {
			await writeFile(join(checkRoot, name), source);
		}
	}
	return {root, packRoot};
}

describe("project-local Check Pack discovery", () => {
	it("derives evaluator identity and semantically resolves deterministic configuration", async () => {
		const fixture = await createCheckPackProject({
			projectChecks: {
				defaults: {enforcement: "observe", execution: {timeoutMs: 5_000}},
				protectedFloors: {
					minimumEnforcement: "warn",
					allowedModelRoutes: ["pi/openai/gpt-5"],
					allowedRuntimeProfiles: ["node-22-isolated"],
					allowedCapabilities: ["temporary_files"],
					maxTimeoutMs: 10_000,
				},
			},
			packConfig: {
				defaults: {
					applicability: {
						stages: ["implementation"],
						paths: ["src"],
						languages: ["typescript"],
					},
					input: {paths: ["src"]},
				},
			},
			checks: [
				{
					id: "architecture",
					files: {
						"CHECK.md": "Require dependency direction to match System ownership.\n",
						"config.json": `${JSON.stringify({
							applicability: {paths: ["src/api"]},
							input: {paths: ["src/api"]},
							execution: {modelRoute: "pi/openai/gpt-5"},
						})}\n`,
					},
				},
				{
					id: "types",
					files: {
						"CHECK.mjs": "export default async function check() { return {outcome: 'pass'}; }\n",
						"config.json": `${JSON.stringify({
							input: {paths: ["src/types"]},
							execution: {
								runtimeProfile: "node-22-isolated",
								capabilities: ["temporary_files"],
							},
						})}\n`,
					},
				},
			],
		});
		const growthFixture = await createCheckPackProject({
			bindingId: "additional-policy",
			packConfig: {
				defaults: {applicability: {stages: ["implementation"]}},
			},
			checks: [
				{
					id: "documentation",
					files: {"CHECK.md": "Require changed behavior to remain documented.\n"},
				},
			],
		});
		try {
			const first = await loadProjectCheckPacks(fixture.root);
			const second = await loadProjectCheckPacks(fixture.root);
			assert.equal(first.version, "1.0.0");
			assert.equal(first.digest, second.digest);
			assert.equal(first.packs.length, 1);
			assert.deepEqual(
				first.packs[0].checks.map((check) => check.id),
				[
					"check-pack:team-policy:architecture",
					"check-pack:team-policy:types",
				],
			);
			const [modelCheck, codeCheck] = first.packs[0].checks;
			assert.equal(modelCheck.evaluatorKind, "model");
			assert.equal(codeCheck.evaluatorKind, "node_esm");
			assert.equal(modelCheck.configuration.enforcement, "warn");
			assert.deepEqual(modelCheck.configuration.applicability.stages, [
				"implementation",
			]);
			assert.deepEqual(modelCheck.configuration.applicability.paths, ["src/api"]);
			assert.equal(
				modelCheck.configuration.execution.modelRoute,
				"pi/openai/gpt-5",
			);
			assert.equal(modelCheck.configuration.execution.timeoutMs, 5_000);
			assert.equal(
				codeCheck.configuration.execution.runtimeProfile,
				"node-22-isolated",
			);
			assert.deepEqual(codeCheck.configuration.execution.capabilities, [
				"temporary_files",
			]);
			assert.match(modelCheck.digest, /^sha256:[0-9a-f]{64}$/u);
			assert.match(first.packs[0].digest, /^sha256:[0-9a-f]{64}$/u);
			const catalog = createCheckCatalog({
				userStandards: [],
				customChecks: [],
				checkPacks: first.packs,
			});
			assert.equal(catalog.version, "11.0.0");
			assert.equal(catalog.checkPackSnapshotDigest, first.digest);
			assert.equal(
				catalog.get(modelCheck.id, "implementation").packCheck.checkDigest,
				modelCheck.digest,
			);
			assert.equal(catalog.get(modelCheck.id, "decision"), undefined);
			assert.equal(catalog.get(codeCheck.id, "implementation").rollout, "warn");
			assert.throws(
				() =>
					createCheckCatalog({
						userStandards: [],
						customChecks: [],
						checkPacks: [
							{...first.packs[0], digest: `sha256:${"0".repeat(64)}`},
						],
					}),
				/content digest mismatch/u,
			);
			const originalIds = catalog.list().map((entry) => entry.check.id);
			const additional = await loadProjectCheckPacks(growthFixture.root);
			const expanded = createCheckCatalog({
				userStandards: [],
				customChecks: [],
				checkPacks: [...first.packs, ...additional.packs],
			});
			assert.notEqual(expanded.digest, catalog.digest);
			assert.equal(
				catalog.get("check-pack:additional-policy:documentation"),
				undefined,
			);
			assert.ok(
				expanded.get("check-pack:additional-policy:documentation", "implementation"),
			);
			assert.deepEqual(catalog.list().map((entry) => entry.check.id), originalIds);
		} finally {
			await rm(fixture.root, {recursive: true, force: true});
			await rm(growthFixture.root, {recursive: true, force: true});
		}
	});

	it("accepts a Check without a colocated override", async () => {
		const fixture = await createCheckPackProject({
			packConfig: {
				defaults: {
					enforcement: "observe",
					applicability: {stages: ["decision"], paths: ["docs"]},
				},
			},
			checks: [
				{
					id: "intent",
					files: {"CHECK.md": "Confirm accepted intent remains explicit.\n"},
				},
			],
		});
		try {
			const snapshot = await loadProjectCheckPacks(fixture.root);
			const check = snapshot.packs[0].checks[0];
			assert.equal(check.configuration.enforcement, "observe");
			assert.deepEqual(check.configuration.applicability.stages, ["decision"]);
			assert.deepEqual(check.configuration.applicability.paths, ["docs"]);
		} finally {
			await rm(fixture.root, {recursive: true, force: true});
		}
	});

	it("fails closed on ambiguous, unsupported, frontmatter, escaping, and symlinked content", async (context) => {
		const cases = [
			{
				name: "multiple evaluators",
				files: {
					"CHECK.md": "Requirement\n",
					"CHECK.mjs": "export default () => ({})\n",
				},
				error: /exactly one CHECK\.\* evaluator/u,
			},
			{
				name: "unsupported evaluator",
				files: {
					"CHECK.py": "def check(input): return {'outcome': 'pass'}\n",
				},
				error: /Unsupported Check evaluator CHECK\.py/u,
			},
			{
				name: "frontmatter",
				files: {"CHECK.md": "---\ntitle: forbidden\n---\nRequirement\n"},
				error: /cannot use frontmatter/u,
			},
			{
				name: "escaping scope",
				files: {
					"CHECK.md": "Requirement\n",
					"config.json": `${JSON.stringify({
						applicability: {paths: ["../secrets"]},
					})}\n`,
				},
				error: /Git-relative exact file/u,
			},
			{
				name: "widened inherited scope",
				projectChecks: {
					defaults: {applicability: {paths: ["src"]}},
				},
				packConfig: {
					defaults: {applicability: {paths: ["tests"]}},
				},
				files: {"CHECK.md": "Requirement\n"},
				error: /Pack applicability paths cannot widen inherited defaults/u,
			},
			{
				name: "budget above protected maximum",
				projectChecks: {
					protectedFloors: {maxTimeoutMs: 1_000},
				},
				files: {
					"CHECK.md": "Requirement\n",
					"config.json": `${JSON.stringify({
						execution: {timeoutMs: 1_001},
					})}\n`,
				},
				error: /timeoutMs exceeds protected maximum 1000/u,
			},
		];
		for (const testCase of cases) {
			await context.test(testCase.name, async () => {
				const fixture = await createCheckPackProject({
					projectChecks: testCase.projectChecks,
					packConfig: testCase.packConfig,
					checks: [{id: "guard", files: testCase.files}],
				});
				try {
					await assert.rejects(
						() => loadProjectCheckPacks(fixture.root),
						testCase.error,
					);
				} finally {
					await rm(fixture.root, {recursive: true, force: true});
				}
			});
		}
		await context.test("symlinked evaluator", async () => {
			const fixture = await createCheckPackProject({
				checks: [
					{id: "guard", files: {"placeholder.txt": "not evaluator\n"}},
				],
			});
			try {
				await writeFile(join(fixture.root, "outside.md"), "Requirement\n");
				await symlink(
					join(fixture.root, "outside.md"),
					join(fixture.packRoot, "checks", "guard", "CHECK.md"),
				);
				await assert.rejects(
					() =>
						discoverProjectCheckPacks({
							repoRoot: fixture.root,
							projectChecks: resolveWikiConfig().checks,
						}),
					/exactly: CHECK\.md, placeholder\.txt|evaluator must be a regular file/u,
				);
			} finally {
				await rm(fixture.root, {recursive: true, force: true});
			}
		});
	});
});
