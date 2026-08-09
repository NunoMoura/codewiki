import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { productReleaseJob } from "../../src/runtime/effects/product-release.ts";
import { RuntimeReactor } from "../../src/runtime/coordinator/reactor.ts";
import { appendRuntimeTraceRecords } from "../../src/runtime/persistence/trace.ts";
import { buildProjectWorkState } from "../../src/work-state/project.ts";
import { seedRuntimeImplementation } from "../helpers/runtime-implementation.mjs";

async function releaseFixture(suffix) {
	const root = await mkdtemp(`${tmpdir()}/codewiki-release-${suffix}-`);
	const seeded = await seedRuntimeImplementation(root, { suffix });
	const commit = "a".repeat(40);
	const tree = "b".repeat(40);
	const artifactDigest = sha256Ref(`artifact:${suffix}`);
	const publicationEvent = {
		type: "trace_event",
		id: `${seeded.traceId}:runtime:product-publication:${seeded.nextSequence}:${suffix}`,
		parentId: seeded.parentId,
		traceId: seeded.traceId,
		sequence: seeded.nextSequence,
		event: "runtime.product.published",
		refs: [artifactDigest, `git-commit:${commit}`, `git-tree:${tree}`],
		createdAt: "2026-07-26T10:00:00.000Z",
		data: {
			schemaVersion: 1,
			runtimeJobId: `product-publication:${"c".repeat(64)}`,
			traceId: seeded.traceId,
			workItemId: seeded.workItemId,
			pushEventId: `${seeded.traceId}:runtime:project-branch-push:1:proof`,
			commit,
			tree,
			contentProof: `git-tree:${tree}`,
			targetId: `registry:${suffix}:candidate`,
			channel: "candidate",
			target: {
				targetId: `registry:${suffix}:candidate`,
				kind: "package-registry",
				channel: "candidate",
				destinationRef: `registry:@example/${suffix}`,
			},
			artifact: {
				artifactId: `package:${suffix}:1.0.0`,
				digest: artifactDigest,
				sizeBytes: 128,
				mediaType: "application/gzip",
				version: "1.0.0",
			},
			adapterId: "fake-publication:v1",
			operationId: `publication-operation:${suffix}:1`,
			revision: `publication-revision:${suffix}:1`,
			authority: {
				kind: "user",
				actor: "user:maintainer",
				ref: `confirmation:publish:${suffix}`,
			},
			publishedAt: "2026-07-26T10:00:00.000Z",
		},
	};
	await appendRuntimeTraceRecords(root, [publicationEvent], seeded.expectedBytes);
	const target = {
		targetId: `registry:${suffix}:release`,
		kind: "package-channel",
		channel: "latest",
		destinationRef: `registry:@example/${suffix}:latest`,
	};
	const authority = {
		kind: "user",
		actor: "user:maintainer",
		ref: `confirmation:release:${suffix}`,
		publicationEventId: publicationEvent.id,
		publicationTargetId: publicationEvent.data.target.targetId,
		publicationRevision: publicationEvent.data.revision,
		publicationOperationId: publicationEvent.data.operationId,
		publicationAdapterId: publicationEvent.data.adapterId,
		artifactId: publicationEvent.data.artifact.artifactId,
		artifactDigest,
		artifactVersion: publicationEvent.data.artifact.version,
		targetId: target.targetId,
		targetChannel: target.channel,
		destinationRef: target.destinationRef,
		adapterId: "fake-release:v1",
		expectedChannelRevision: null,
		expectedChannelArtifactDigest: null,
	};
	const publishedArtifact = {
		revision: publicationEvent.data.revision,
		artifactDigest,
		operationId: publicationEvent.data.operationId,
	};
	const channel = {
		revision: null,
		artifactDigest: null,
		operationId: null,
	};
	const calls = [];
	const adapter = {
		id: "fake-release:v1",
		idempotency: "provider-key",
		async inspectPublishedArtifact(input) {
			calls.push({ kind: "inspect-published", input });
			return { ...publishedArtifact };
		},
		async inspectReleaseChannel(input) {
			calls.push({ kind: "inspect-channel", input });
			return { ...channel };
		},
		async release(input) {
			calls.push({ kind: "release", input });
			assert.deepEqual(channel, input.expectedChannel);
			channel.revision = `release-revision:${suffix}:1`;
			channel.artifactDigest = input.artifactDigest;
			channel.operationId = `release-operation:${suffix}:1`;
			return {
				operationId: channel.operationId,
				revision: channel.revision,
				artifactDigest: channel.artifactDigest,
			};
		},
	};
	return {
		root,
		seeded,
		publicationEvent,
		target,
		authority,
		publishedArtifact,
		channel,
		calls,
		adapter,
		reactor: new RuntimeReactor(root),
	};
}

function releaseJob(context, overrides = {}) {
	return productReleaseJob({
		repoRoot: context.root,
		reactor: context.reactor,
		plan: {
			publicationEventId: context.publicationEvent.id,
			target: context.target,
			authority: context.authority,
		},
		publicationEvent: context.publicationEvent,
		adapter: context.adapter,
		createdAt: "2026-07-26T10:00:01.000Z",
		...overrides,
	});
}

async function traceRecords(context) {
	return (
		await readFile(
			join(
				context.root,
				".codewiki",
				"traces",
				`${context.seeded.traceId}.jsonl`,
			),
			"utf8",
		)
	)
		.trim()
		.split("\n")
		.map((line) => JSON.parse(line));
}

function sha256Ref(value) {
	return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

async function cleanup(context) {
	await rm(context.root, { recursive: true, force: true });
}

test("exact published artifact promotes to release channel and appends proof", async () => {
	const context = await releaseFixture("proof");
	try {
		const receipt = await releaseJob(context).run(
			new AbortController().signal,
		);
		assert.equal(receipt.artifactDigest, context.authority.artifactDigest);
		assert.equal(receipt.channel, "latest");
		assert.equal(
			context.calls.filter((call) => call.kind === "release").length,
			1,
		);
		const records = await traceRecords(context);
		const event = records.findLast(
			(record) => record.event === "runtime.product.released",
		);
		assert.ok(event);
		assert.equal(event.parentId, context.publicationEvent.id);
		assert.equal(event.data.artifact.digest, context.authority.artifactDigest);
		assert.equal(event.data.authority.kind, "user");
		assert.equal(
			records.some((record) => record.event === "runtime.product.deployed"),
			false,
		);
		const workState = await buildProjectWorkState({ repoRoot: context.root });
		const item = workState.workItems.find(
			(candidate) => candidate.id === context.seeded.workItemId,
		);
		assert.equal(item?.releaseProofs?.[0]?.eventId, event.id);
	} finally {
		await cleanup(context);
	}
});

test("persisted release operation recovers append without another promotion", async () => {
	const context = await releaseFixture("recovery");
	let appendChecks = 0;
	try {
		await assert.rejects(
			releaseJob(context, {
				beforeAppend() {
					appendChecks += 1;
					if (appendChecks === 2) throw new Error("simulated append crash");
				},
			}).run(new AbortController().signal),
			/simulated append crash/,
		);
		const receipt = await releaseJob(context).run(
			new AbortController().signal,
		);
		assert.equal(receipt.revision, "release-revision:recovery:1");
		assert.equal(
			context.calls.filter((call) => call.kind === "release").length,
			1,
		);
	} finally {
		await cleanup(context);
	}
});

test("provider acceptance before local release evidence remains unattributed", async () => {
	const context = await releaseFixture("acceptance-gap");
	try {
		const release = context.adapter.release;
		context.adapter.release = async (input, signal) => {
			await release(input, signal);
			throw new Error("simulated host death");
		};
		await assert.rejects(
			releaseJob(context).run(new AbortController().signal),
			/adapter failed/i,
		);
		context.adapter.release = release;
		await assert.rejects(
			releaseJob(context).run(new AbortController().signal),
			/without exact release recovery evidence/i,
		);
		assert.equal(
			(await traceRecords(context)).some(
				(record) => record.event === "runtime.product.released",
			),
			false,
		);
	} finally {
		await cleanup(context);
	}
});

test("preexisting matching release channel is not attributed", async () => {
	const context = await releaseFixture("preexisting");
	try {
		Object.assign(context.channel, {
			revision: "release-revision:external:1",
			artifactDigest: context.authority.artifactDigest,
			operationId: "release-operation:external:1",
		});
		await assert.rejects(
			releaseJob(context).run(new AbortController().signal),
			/without exact release recovery evidence/i,
		);
	} finally {
		await cleanup(context);
	}
});

test("release-channel drift fails before promotion", async () => {
	const context = await releaseFixture("channel-drift");
	try {
		Object.assign(context.channel, {
			revision: "release-revision:other:1",
			artifactDigest: sha256Ref("other"),
			operationId: "release-operation:other:1",
		});
		await assert.rejects(
			releaseJob(context).run(new AbortController().signal),
			/channel moved after authority/i,
		);
		assert.equal(
			context.calls.filter((call) => call.kind === "release").length,
			0,
		);
	} finally {
		await cleanup(context);
	}
});

test("published artifact drift blocks release", async () => {
	const context = await releaseFixture("publication-drift");
	try {
		context.publishedArtifact.artifactDigest = sha256Ref("foreign");
		await assert.rejects(
			releaseJob(context).run(new AbortController().signal),
			/differs from canonical publication proof/i,
		);
		assert.equal(
			context.calls.filter((call) => call.kind === "release").length,
			0,
		);
	} finally {
		await cleanup(context);
	}
});

test("symbolic release recovery path fails before channel mutation", async () => {
	const context = await releaseFixture("symbolic-runtime");
	try {
		const external = await mkdtemp(`${tmpdir()}/codewiki-release-external-`);
		await mkdir(join(context.root, ".codewiki", "runtime"), { recursive: true });
		await symlink(
			external,
			join(context.root, ".codewiki", "runtime", "releases"),
		);
		await assert.rejects(
			releaseJob(context).run(new AbortController().signal),
			/runtime path cannot be symbolic/i,
		);
		assert.equal(
			context.calls.filter((call) => call.kind === "release").length,
			0,
		);
		await rm(external, { recursive: true, force: true });
	} finally {
		await cleanup(context);
	}
});

test("policy, mismatched artifact, or mismatched adapter authority is rejected", async () => {
	const context = await releaseFixture("authority");
	try {
		for (const authority of [
			{ ...context.authority, kind: "policy" },
			{ ...context.authority, artifactDigest: sha256Ref("different") },
			{ ...context.authority, adapterId: "foreign-release:v1" },
		]) {
			assert.throws(
				() =>
					releaseJob(context, {
						plan: {
							publicationEventId: context.publicationEvent.id,
							target: context.target,
							authority,
						},
					}),
				/requires exact user authority/i,
			);
		}
	} finally {
		await cleanup(context);
	}
});

test("release adapter must declare provider-key idempotency", async () => {
	const context = await releaseFixture("idempotency");
	try {
		assert.throws(
			() =>
				releaseJob(context, {
					adapter: { ...context.adapter, idempotency: "none" },
				}),
			/adapter identity is invalid/i,
		);
	} finally {
		await cleanup(context);
	}
});

test("scheduled release identity is immutable", async () => {
	const context = await releaseFixture("immutable");
	try {
		const plan = {
			publicationEventId: context.publicationEvent.id,
			target: { ...context.target },
			authority: { ...context.authority },
		};
		const publicationEvent = {
			...context.publicationEvent,
			refs: [...context.publicationEvent.refs],
			data: structuredClone(context.publicationEvent.data),
		};
		const job = releaseJob(context, { plan, publicationEvent });
		plan.target.destinationRef = "registry:@attacker/package:latest";
		plan.authority.actor = "user:attacker";
		publicationEvent.data.contentProof = "git-tree:forged";
		const receipt = await job.run(new AbortController().signal);
		assert.equal(receipt.destinationRef, context.target.destinationRef);
		assert.equal(
			context.calls.find((call) => call.kind === "release")?.input.target
				.destinationRef,
			context.target.destinationRef,
		);
	} finally {
		await cleanup(context);
	}
});

test("mutable supplied publication proof cannot replace canonical proof", async () => {
	const context = await releaseFixture("canonical");
	try {
		const publicationEvent = {
			...context.publicationEvent,
			data: {
				...context.publicationEvent.data,
				contentProof: "git-tree:forged",
			},
		};
		await assert.rejects(
			releaseJob(context, { publicationEvent }).run(
				new AbortController().signal,
			),
			/exact canonical publication proof/i,
		);
	} finally {
		await cleanup(context);
	}
});

test("malformed release operation cannot become proof", async () => {
	const context = await releaseFixture("malformed");
	try {
		context.adapter.release = async () => ({
			operationId: "release-operation:malformed",
			revision: "release-revision:malformed",
			artifactDigest: sha256Ref("wrong"),
		});
		await assert.rejects(
			releaseJob(context).run(new AbortController().signal),
			/adapter operation is invalid/i,
		);
	} finally {
		await cleanup(context);
	}
});

test("release adapter failures are redacted", async () => {
	const context = await releaseFixture("redaction");
	try {
		context.adapter.release = async () => {
			throw new Error("secret-release-token");
		};
		await assert.rejects(
			releaseJob(context).run(new AbortController().signal),
			(error) => {
				assert.equal(error.message, "Product release adapter failed.");
				assert.equal(error.message.includes("secret-release-token"), false);
				return true;
			},
		);
	} finally {
		await cleanup(context);
	}
});

test("release-channel operation mismatch after mutation fails closed", async () => {
	const context = await releaseFixture("post-drift");
	try {
		const release = context.adapter.release;
		context.adapter.release = async (input, signal) => {
			const operation = await release(input, signal);
			context.channel.operationId = "release-operation:foreign:1";
			return operation;
		};
		await assert.rejects(
			releaseJob(context).run(new AbortController().signal),
			/channel does not match operation proof/i,
		);
		assert.equal(
			(await traceRecords(context)).some(
				(record) => record.event === "runtime.product.released",
			),
			false,
		);
	} finally {
		await cleanup(context);
	}
});
