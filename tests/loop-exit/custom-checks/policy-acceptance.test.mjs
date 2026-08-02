import assert from "node:assert/strict";
import {execFile} from "node:child_process";
import {mkdtemp, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {promisify} from "node:util";
import {describe, it} from "node:test";

import {
	activateCustomCheckDefinition,
	assertCustomCheckMutationReceipt,
	assertCustomCheckPolicyReviewReceipt,
	CUSTOM_CHECK_MUTATION_PROTOCOL,
	CUSTOM_CHECK_POLICY_ACCEPTANCE_PROTOCOL,
	createCustomCheckDefinition,
	createCustomCheckMutationRuntime,
	createCustomCheckPolicyAcceptanceRuntime,
	createCustomCheckPolicyReviewReceipt,
	createCustomCheckPolicyReviewRequest,
	createWikiConfigCustomCheckStore,
	loadProtectedCustomCheckConfigSnapshot,
	parseCustomCheckPolicyAcceptanceCommand,
} from "../../../src/loop-exit/custom-checks/index.ts";
import {writeWikiConfigFile} from "../../../src/project/config-file.ts";
import {resolveWikiConfig} from "../../../src/project/config.ts";
import {
	createTestUserStandard,
	standardRefsFor,
} from "./user-standard-fixture.mjs";
import {createCompletedDistillationFixture} from "./distillation-fixture.mjs";

const USER_STANDARD = createTestUserStandard();
const USER_STANDARDS = [USER_STANDARD];
const execFileAsync = promisify(execFile);

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

function authority(actorId, role = "maintainer") {
	return {
		actorId,
		principalRef: `identity:${actorId}`,
		role,
		actorPolicyDigest: `sha256:${"1".repeat(64)}`,
		authenticationEvidenceId: `auth:test:${actorId}`,
		runtimeProtocolDigest: `sha256:${"2".repeat(64)}`,
	};
}

async function git(cwd, args) {
	return execFileAsync("git", args, {
		cwd,
		encoding: "utf8",
		maxBuffer: 4 * 1024 * 1024,
	});
}

async function createFixture(options = {}) {
	const root = await mkdtemp(join(tmpdir(), "codewiki-custom-check-acceptance-"));
	const remote = join(root, "remote.git");
	const repo = join(root, "repo");
	await git(root, ["init", "--bare", "--quiet", remote]);
	await git(root, ["init", "--quiet", "--initial-branch=main", repo]);
	await git(repo, ["config", "user.name", "CodeWiki Test"]);
	await git(repo, ["config", "user.email", "test@codewiki.local"]);
	await git(repo, ["remote", "add", "origin", remote]);
	const active = activateCustomCheckDefinition(
		createCustomCheckDefinition(proposal(), USER_STANDARDS),
		USER_STANDARDS,
	);
	await writeWikiConfigFile(
		repo,
		resolveWikiConfig({
			project: "policy-acceptance",
			userStandards: USER_STANDARDS,
			customChecks: [active],
		}),
	);
	await git(repo, ["add", ".codewiki/config.json"]);
	await git(repo, ["commit", "--quiet", "-m", "protected config"]);
	await git(repo, ["push", "--quiet", "origin", "main:refs/heads/main"]);
	const expectedHead = (await git(repo, ["rev-parse", "HEAD"])).stdout.trim();
	const protectedBase = await loadProtectedCustomCheckConfigSnapshot({
		repoRoot: repo,
		protectedSourceHead: expectedHead,
	});
	const store = createWikiConfigCustomCheckStore(repo);
	const current = await store.load();
	const mutationRuntime = createCustomCheckMutationRuntime({
		store,
		loadProtectedBase: async () => protectedBase,
		authorize: () => true,
		now: () => new Date("2026-08-01T12:00:00.000Z"),
	});
	const mutationFields = options.mutationFields
		? await options.mutationFields({current, protectedBase, expectedHead, active})
		: {
				action: "disable",
				idempotencyKey: "disable-public-api-ownership",
				customCheckId: active.customCheckId,
			};
	const mutation = await mutationRuntime.execute(
		{
			protocolId: CUSTOM_CHECK_MUTATION_PROTOCOL.id,
			protocolVersion: CUSTOM_CHECK_MUTATION_PROTOCOL.version,
			expectedConfigDigest: current.projectConfigDigest,
			expectedProtectedSourceHead: expectedHead,
			expectedProtectedConfigDigest: protectedBase.projectConfigDigest,
			...mutationFields,
		},
		authority("policy-editor"),
	);
	const reviewRequest = createCustomCheckPolicyReviewRequest({
		mutationReceipt: mutation.receipt,
		proposedConfig: mutation.state,
	});
	const reviewReceipt = createCustomCheckPolicyReviewReceipt({
		request: reviewRequest,
		status: "pass",
		reviewer: authority("policy-reviewer", "policy_reviewer"),
		evidenceIds: ["evidence:policy-review:1"],
		summary: "Protected-base policy remains effective and next policy is coherent.",
		reviewedAt: "2026-08-01T12:05:00.000Z",
	});
	const command = {
		protocolId: CUSTOM_CHECK_POLICY_ACCEPTANCE_PROTOCOL.id,
		protocolVersion: CUSTOM_CHECK_POLICY_ACCEPTANCE_PROTOCOL.version,
		idempotencyKey:
			options.acceptanceIdempotencyKey ?? "accept-disable-public-api-ownership",
		mutationReceipt: mutation.receipt,
		reviewReceipt,
	};
	return {
		root,
		remote,
		repo,
		active,
		expectedHead,
		protectedBase,
		mutation,
		reviewRequest,
		reviewReceipt,
		command,
		cleanup: () => rm(root, {recursive: true, force: true}),
	};
}

function acceptanceRuntime(fixture, overrides = {}) {
	return createCustomCheckPolicyAcceptanceRuntime({
		repoRoot: fixture.repo,
		repositoryIdentity: `sha256:${"a".repeat(64)}`,
		remote: "origin",
		protectedBranch: "main",
		verifyMutationReceipt: (receipt) =>
			receipt.receiptId === fixture.mutation.receipt.receiptId,
		verifyReviewReceipt: (receipt, request) =>
			receipt.receiptId === fixture.reviewReceipt.receiptId &&
			request.requestDigest === fixture.reviewRequest.requestDigest,
		authorize: (request) => request.authority.role === "policy_acceptor",
		now: () => new Date("2026-08-01T12:10:00.000Z"),
		...overrides,
	});
}

async function remoteHead(fixture) {
	return (
		await git(fixture.root, [
			"--git-dir",
			fixture.remote,
			"rev-parse",
			"refs/heads/main",
		])
	).stdout.trim();
}

describe("Custom Check protected policy acceptance", () => {
	it("accepts only the reviewed config commit and replays its exact Git result", async () => {
		const fixture = await createFixture();
		try {
			await writeFile(join(fixture.repo, "unrelated.txt"), "must stay uncommitted\n");
			const acceptor = authority("policy-acceptor", "policy_acceptor");
			const runtime = acceptanceRuntime(fixture);
			const accepted = await runtime.execute(fixture.command, acceptor);
			assert.equal(accepted.replayed, false);
			assert.equal(
				accepted.receipt.expectedProtectedSourceHead,
				fixture.expectedHead,
			);
			assert.equal(
				accepted.receipt.acceptedProtectedSourceHead,
				await remoteHead(fixture),
			);
			assert.equal(accepted.protectedConfig.customChecks[0].lifecycle, "disabled");
			assert.equal(
				accepted.protectedConfig.projectConfigDigest,
				fixture.mutation.receipt.configDigestAfter,
			);

			const parent = (
				await git(fixture.repo, [
					"rev-parse",
					`${accepted.receipt.acceptedProtectedSourceHead}^`,
				])
			).stdout.trim();
			assert.equal(parent, fixture.expectedHead);
			const changedPaths = (
				await git(fixture.repo, [
					"diff-tree",
					"--no-commit-id",
					"--name-only",
					"-r",
					fixture.expectedHead,
					accepted.receipt.acceptedProtectedSourceHead,
				])
			).stdout.trim();
			assert.equal(changedPaths, ".codewiki/config.json");
			const message = (
				await git(fixture.repo, [
					"show",
					"-s",
					"--format=%B",
					accepted.receipt.acceptedProtectedSourceHead,
				])
			).stdout;
			assert.match(message, new RegExp(fixture.mutation.receipt.receiptId));
			assert.match(message, new RegExp(fixture.reviewReceipt.receiptId));
			assert.match(message, new RegExp(accepted.receipt.acceptanceIntentDigest));
			assert.ok(!message.includes("unrelated.txt"));

			const inProcessReplay = await runtime.execute(fixture.command, acceptor);
			assert.equal(inProcessReplay.replayed, true);
			assert.equal(inProcessReplay.receipt.receiptId, accepted.receipt.receiptId);
			const restartedReplay = await acceptanceRuntime(fixture).execute(
				fixture.command,
				acceptor,
			);
			assert.equal(restartedReplay.replayed, true);
			assert.equal(restartedReplay.receipt.receiptId, accepted.receipt.receiptId);
			assert.equal(
				restartedReplay.receipt.acceptedProtectedSourceHead,
				accepted.receipt.acceptedProtectedSourceHead,
			);
		} finally {
			await fixture.cleanup();
		}
	});

	it("accepts one reviewed distilled Standard-plus-Check bundle atomically", async () => {
		let distilled;
		const fixture = await createFixture({
			acceptanceIdempotencyKey: "accept-service-policy-bundle",
			async mutationFields() {
				distilled = await createCompletedDistillationFixture();
				return {
					action: "create_distilled_bundle",
					idempotencyKey: "create-service-policy-bundle",
					distillationReceipt: distilled.receipt,
					selectedProposalIds: distilled.bundle.customCheckProposals.map(
						(proposal) => proposal.proposalId,
					),
				};
			},
		});
		try {
			const accepted = await acceptanceRuntime(fixture).execute(
				fixture.command,
				authority("policy-acceptor", "policy_acceptor"),
			);
			assert.equal(CUSTOM_CHECK_POLICY_ACCEPTANCE_PROTOCOL.version, "3.0.0");
			assert.equal(accepted.protectedConfig.userStandards.length, 2);
			assert.equal(accepted.protectedConfig.customChecks.length, 3);
			assert.equal(
				accepted.protectedConfig.userStandards.some(
					(standard) =>
						standard.userStandardId === distilled.bundle.userStandard.userStandardId,
				),
				true,
			);
			assert.equal(
				accepted.protectedConfig.customChecks.filter(
					(check) => check.lifecycle === "draft",
				).length,
				2,
			);
			assert.equal(
				fixture.mutation.receipt.distillationReceipt.receiptId,
				distilled.receipt.receiptId,
			);
			assert.equal(
				accepted.receipt.acceptedProtectedSourceHead,
				await remoteHead(fixture),
			);
		} finally {
			await fixture.cleanup();
		}
	});

	it("rejects stacked working policy changes that did not start from protected base", async () => {
		const fixture = await createFixture();
		try {
			const store = createWikiConfigCustomCheckStore(fixture.repo);
			const current = await store.load();
			const mutationRuntime = createCustomCheckMutationRuntime({
				store,
				loadProtectedBase: async () => fixture.protectedBase,
				authorize: () => true,
				now: () => new Date("2026-08-01T12:06:00.000Z"),
			});
			const stackedMutation = await mutationRuntime.execute(
				{
					protocolId: CUSTOM_CHECK_MUTATION_PROTOCOL.id,
					protocolVersion: CUSTOM_CHECK_MUTATION_PROTOCOL.version,
					action: "create",
					idempotencyKey: "stack-unreviewed-policy",
					expectedConfigDigest: current.projectConfigDigest,
					expectedProtectedSourceHead: fixture.expectedHead,
					expectedProtectedConfigDigest:
						fixture.protectedBase.projectConfigDigest,
					proposal: proposal({
						name: "Public API escalation owner",
						requirement:
							"Every changed public API names its escalation owner.",
					}),
				},
				authority("policy-editor"),
			);
			const reviewRequest = createCustomCheckPolicyReviewRequest({
				mutationReceipt: stackedMutation.receipt,
				proposedConfig: stackedMutation.state,
			});
			const reviewReceipt = createCustomCheckPolicyReviewReceipt({
				request: reviewRequest,
				status: "pass",
				reviewer: authority("policy-reviewer", "policy_reviewer"),
				evidenceIds: ["evidence:stacked-review:1"],
				summary: "Latest change reviewed, but prior working mutation remains stacked.",
				reviewedAt: "2026-08-01T12:07:00.000Z",
			});
			const stackedFixture = {
				...fixture,
				mutation: stackedMutation,
				reviewRequest,
				reviewReceipt,
			};
			await assert.rejects(
				acceptanceRuntime(stackedFixture).execute(
					{
						protocolId: CUSTOM_CHECK_POLICY_ACCEPTANCE_PROTOCOL.id,
						protocolVersion:
							CUSTOM_CHECK_POLICY_ACCEPTANCE_PROTOCOL.version,
						idempotencyKey: "reject-stacked-policy",
						mutationReceipt: stackedMutation.receipt,
						reviewReceipt,
					},
					authority("policy-acceptor", "policy_acceptor"),
				),
				/does not start from the exact protected base/,
			);
		} finally {
			await fixture.cleanup();
		}
	});

	it("rejects failed, unauthenticated, and tampered policy review receipts", async () => {
		const fixture = await createFixture();
		try {
			const failedReview = createCustomCheckPolicyReviewReceipt({
				request: fixture.reviewRequest,
				status: "fail",
				reviewer: authority("policy-reviewer", "policy_reviewer"),
				evidenceIds: ["evidence:policy-review:failed"],
				summary: "Policy removes required assurance without replacement.",
				reviewedAt: "2026-08-01T12:05:00.000Z",
			});
			const failedCommand = {
				...fixture.command,
				idempotencyKey: "failed-policy-review",
				reviewReceipt: failedReview,
			};
			let authorizations = 0;
			await assert.rejects(
				() =>
					acceptanceRuntime(fixture, {
						verifyReviewReceipt: () => true,
						authorize: () => {
							authorizations += 1;
							return true;
						},
					}).execute(
						failedCommand,
						authority("policy-acceptor", "policy_acceptor"),
					),
				(error) => error.code === "forbidden" && /did not pass/.test(error.message),
			);
			assert.equal(authorizations, 0);
			assert.equal(await remoteHead(fixture), fixture.expectedHead);

			await assert.rejects(
				() =>
					acceptanceRuntime(fixture, {
						verifyReviewReceipt: () => false,
					}).execute(
						{...fixture.command, idempotencyKey: "unauthenticated-review"},
						authority("policy-acceptor", "policy_acceptor"),
					),
				(error) =>
					error.code === "forbidden" && /could not be authenticated/.test(error.message),
			);

			assert.throws(
				() =>
					parseCustomCheckPolicyAcceptanceCommand({
						...fixture.command,
						approval: true,
					}),
				/unsupported field approval/,
			);
			assert.throws(
				() =>
					parseCustomCheckPolicyAcceptanceCommand({
						...fixture.command,
						protocolVersion: "1.0.0",
					}),
				/protocolVersion is invalid/,
			);
			const tamperedMutation = {
				...fixture.mutation.receipt,
				configDigestAfter: `sha256:${"0".repeat(64)}`,
			};
			assert.throws(
				() => assertCustomCheckMutationReceipt(tamperedMutation),
				/id does not match/,
			);
			const tamperedReview = {
				...fixture.reviewReceipt,
				summary: "Changed after review.",
			};
			assert.throws(
				() => assertCustomCheckPolicyReviewReceipt(tamperedReview),
				/id does not match/,
			);
		} finally {
			await fixture.cleanup();
		}
	});

	it("rejects a stale protected branch without rebasing or retrying", async () => {
		const fixture = await createFixture();
		try {
			const competitor = join(fixture.root, "competitor");
			let competingHead;
			const runtime = acceptanceRuntime(fixture, {
				authorize: async () => {
					await git(fixture.root, [
						"clone",
						"--quiet",
						"--branch",
						"main",
						fixture.remote,
						competitor,
					]);
					await git(competitor, ["config", "user.name", "Competing Writer"]);
					await git(competitor, ["config", "user.email", "writer@codewiki.local"]);
					await writeFile(join(competitor, "README.md"), "competing change\n");
					await git(competitor, ["add", "README.md"]);
					await git(competitor, ["commit", "--quiet", "-m", "competing change"]);
					await git(competitor, ["push", "--quiet", "origin", "main"]);
					competingHead = (await git(competitor, ["rev-parse", "HEAD"])).stdout.trim();
					return true;
				},
			});
			await assert.rejects(
				() =>
					runtime.execute(
						fixture.command,
						authority("policy-acceptor", "policy_acceptor"),
					),
				(error) =>
					error.code === "conflict" && /changed during policy acceptance/.test(error.message),
			);
			assert.equal(await remoteHead(fixture), competingHead);
			assert.notEqual(competingHead, fixture.expectedHead);
		} finally {
			await fixture.cleanup();
		}
	});

	it("rejects unsupported Git remote transports before review acceptance", async () => {
		const fixture = await createFixture();
		try {
			await git(fixture.repo, [
				"remote",
				"set-url",
				"origin",
				"ext::sh -c echo-unsafe",
			]);
			await assert.rejects(
				() =>
					acceptanceRuntime(fixture).execute(
						fixture.command,
						authority("policy-acceptor", "policy_acceptor"),
					),
				/remote URL is unsupported/,
			);
		} finally {
			await fixture.cleanup();
		}
	});

	it("holds the config lock and rejects working-config drift before push", async () => {
		const fixture = await createFixture();
		try {
			const runtime = acceptanceRuntime(fixture, {
				authorize: async () => {
					await writeWikiConfigFile(
						fixture.repo,
						resolveWikiConfig({
							project: "drifted-policy",
							userStandards: fixture.mutation.state.userStandards,
							customChecks: fixture.mutation.state.customChecks,
						}),
					);
					return true;
				},
			});
			await assert.rejects(
				() =>
					runtime.execute(
						fixture.command,
						authority("policy-acceptor", "policy_acceptor"),
					),
				(error) =>
					error.code === "conflict" && /changed during policy acceptance/.test(error.message),
			);
			assert.equal(await remoteHead(fixture), fixture.expectedHead);
		} finally {
			await fixture.cleanup();
		}
	});
});
