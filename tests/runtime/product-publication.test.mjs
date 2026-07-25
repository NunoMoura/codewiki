import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
	mkdir,
	mkdtemp,
	readFile,
	rm,
	symlink,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { productPublicationJob } from "../../src/runtime/product-publication.ts";
import { RuntimeReactor } from "../../src/runtime/reactor.ts";
import { appendRuntimeTraceRecords } from "../../src/runtime/trace-writer.ts";
import { buildProjectWorkState } from "../../src/work-state/project.ts";
import { seedRuntimeImplementation } from "../helpers/runtime-implementation.mjs";

async function publicationFixture(suffix) {
	const root = await mkdtemp(`${tmpdir()}/codewiki-publication-${suffix}-`);
	const seeded = await seedRuntimeImplementation(root, { suffix });
	const commit = "a".repeat(40);
	const tree = "b".repeat(40);
	const pushEvent = {
		type: "trace_event",
		id: `${seeded.traceId}:runtime:project-branch-push:${seeded.nextSequence}:${suffix}`,
		parentId: seeded.parentId,
		traceId: seeded.traceId,
		sequence: seeded.nextSequence,
		event: "runtime.project_branch.pushed",
		refs: [`git-commit:${commit}`, `git-tree:${tree}`],
		createdAt: "2026-07-25T10:00:00.000Z",
		data: {
			schemaVersion: 1,
			runtimeJobId: `project-branch-push:${"c".repeat(64)}`,
			traceId: seeded.traceId,
			workItemId: seeded.workItemId,
			commit,
			tree,
			contentProof: `git-tree:${tree}`,
		},
	};
	await appendRuntimeTraceRecords(root, [pushEvent], seeded.expectedBytes);
	const artifactDirectory = join(
		root,
		".codewiki",
		"runtime",
		"publications",
		"artifacts",
	);
	await mkdir(artifactDirectory, { recursive: true });
	const artifactPath = join(artifactDirectory, `${suffix}.tgz`);
	const artifactBytes = Buffer.from(`publication artifact ${suffix}\n`, "utf8");
	await writeFile(artifactPath, artifactBytes);
	const artifactDigest = sha256Ref(artifactBytes);
	const target = {
		targetId: `registry:${suffix}`,
		kind: "package-registry",
		channel: "candidate",
		destinationRef: `registry:@example/${suffix}`,
	};
	const artifact = {
		artifactId: `package:${suffix}:1.0.0`,
		path: `.codewiki/runtime/publications/artifacts/${suffix}.tgz`,
		digest: artifactDigest,
		sizeBytes: artifactBytes.length,
		mediaType: "application/gzip",
		version: "1.0.0",
		sourceCommit: commit,
		sourceTree: tree,
	};
	const authority = {
		kind: "user",
		actor: "user:maintainer",
		ref: `confirmation:publish:${suffix}`,
		pushEventId: pushEvent.id,
		targetId: target.targetId,
		targetChannel: target.channel,
		destinationRef: target.destinationRef,
		artifactId: artifact.artifactId,
		artifactDigest,
		artifactVersion: artifact.version,
		adapterId: "fake-registry:v1",
		expectedRevision: null,
		expectedArtifactDigest: null,
	};
	const state = {
		revision: null,
		artifactDigest: null,
		operationId: null,
	};
	const calls = [];
	const adapter = {
		id: "fake-registry:v1",
		idempotency: "provider-key",
		async inspect(input) {
			calls.push({ kind: "inspect", input });
			return { ...state };
		},
		async publish(input) {
			calls.push({ kind: "publish", input });
			assert.deepEqual(state, input.expectedDestination);
			state.revision = `revision:${suffix}:1`;
			state.artifactDigest = input.artifact.digest;
			state.operationId = `operation:${suffix}:1`;
			return {
				operationId: state.operationId,
				revision: state.revision,
				artifactDigest: state.artifactDigest,
			};
		},
	};
	return {
		root,
		seeded,
		pushEvent,
		artifactPath,
		artifactBytes,
		target,
		artifact,
		authority,
		state,
		calls,
		adapter,
		reactor: new RuntimeReactor(root),
	};
}

function publicationJob(context, overrides = {}) {
	return productPublicationJob({
		repoRoot: context.root,
		reactor: context.reactor,
		plan: {
			pushEventId: context.pushEvent.id,
			target: context.target,
			artifact: context.artifact,
			authority: context.authority,
		},
		pushEvent: context.pushEvent,
		adapter: context.adapter,
		createdAt: "2026-07-25T10:00:01.000Z",
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

test("exact artifact publishes through adapter and appends canonical proof", async () => {
	const context = await publicationFixture("proof");
	try {
		const receipt = await publicationJob(context).run(
			new AbortController().signal,
		);
		assert.equal(receipt.artifactDigest, context.artifact.digest);
		assert.equal(receipt.revision, "revision:proof:1");
		assert.equal(
			context.calls.filter((call) => call.kind === "publish").length,
			1,
		);
		const records = await traceRecords(context);
		const event = records.findLast(
			(record) => record.event === "runtime.product.published",
		);
		assert.ok(event);
		assert.equal(event.parentId, context.pushEvent.id);
		assert.equal(event.data.artifact.digest, context.artifact.digest);
		assert.equal(event.data.target.targetId, context.target.targetId);
		assert.equal(event.data.authority.kind, "user");
		assert.equal(
			records.some((record) =>
				["runtime.product.deployed", "runtime.product.released"].includes(
					record.event,
				),
			),
			false,
		);
		const workState = await buildProjectWorkState({ repoRoot: context.root });
		const item = workState.workItems.find(
			(candidate) => candidate.id === context.seeded.workItemId,
		);
		assert.equal(item?.publicationProofs?.[0]?.eventId, event.id);
		assert.equal(item?.publicationProofs?.[0]?.operationId, "operation:proof:1");
	} finally {
		await cleanup(context);
	}
});

test("persisted publication operation recovers append without republishing", async () => {
	const context = await publicationFixture("recovery");
	let appendChecks = 0;
	try {
		await assert.rejects(
			publicationJob(context, {
				beforeAppend() {
					appendChecks += 1;
					if (appendChecks === 2) throw new Error("simulated append crash");
				},
			}).run(new AbortController().signal),
			/simulated append crash/,
		);
		assert.equal(context.state.artifactDigest, context.artifact.digest);
		const receipt = await publicationJob(context).run(
			new AbortController().signal,
		);
		assert.equal(receipt.revision, "revision:recovery:1");
		assert.equal(
			context.calls.filter((call) => call.kind === "publish").length,
			1,
		);
	} finally {
		await cleanup(context);
	}
});

test("provider acceptance before local operation evidence remains unattributed", async () => {
	const context = await publicationFixture("acceptance-gap");
	try {
		const publish = context.adapter.publish;
		context.adapter.publish = async (input, signal) => {
			await publish(input, signal);
			throw new Error("simulated host death before operation persistence");
		};
		await assert.rejects(
			publicationJob(context).run(new AbortController().signal),
			/adapter failed/i,
		);
		context.adapter.publish = publish;
		await assert.rejects(
			publicationJob(context).run(new AbortController().signal),
			/without exact publication recovery evidence/i,
		);
		assert.equal(
			(await traceRecords(context)).some(
				(record) => record.event === "runtime.product.published",
			),
			false,
		);
	} finally {
		await cleanup(context);
	}
});

test("preexisting matching artifact without operation evidence is not attributed", async () => {
	const context = await publicationFixture("preexisting");
	try {
		Object.assign(context.state, {
			revision: "revision:external:1",
			artifactDigest: context.artifact.digest,
			operationId: "operation:external:1",
		});
		await assert.rejects(
			publicationJob(context).run(new AbortController().signal),
			/without exact publication recovery evidence/i,
		);
		assert.equal(
			(await traceRecords(context)).some(
				(record) => record.event === "runtime.product.published",
			),
			false,
		);
	} finally {
		await cleanup(context);
	}
});

test("destination drift after authority fails before publication", async () => {
	const context = await publicationFixture("drift");
	try {
		Object.assign(context.state, {
			revision: "revision:other:1",
			artifactDigest: sha256Ref("other"),
			operationId: "operation:other:1",
		});
		await assert.rejects(
			publicationJob(context).run(new AbortController().signal),
			/destination moved after authority/i,
		);
		assert.equal(
			context.calls.filter((call) => call.kind === "publish").length,
			0,
		);
	} finally {
		await cleanup(context);
	}
});

test("artifact digest drift fails before adapter inspection", async () => {
	const context = await publicationFixture("artifact-drift");
	try {
		await writeFile(context.artifactPath, "tampered artifact\n");
		await assert.rejects(
			publicationJob(context).run(new AbortController().signal),
			/artifact (size|digest) does not match proof/i,
		);
		assert.equal(context.calls.length, 0);
	} finally {
		await cleanup(context);
	}
});

test("symbolic artifact path fails closed", async () => {
	const context = await publicationFixture("artifact-symbolic");
	try {
		const actualPath = `${context.artifactPath}.actual`;
		await writeFile(actualPath, context.artifactBytes);
		await rm(context.artifactPath);
		await symlink(actualPath, context.artifactPath);
		await assert.rejects(
			publicationJob(context).run(new AbortController().signal),
			/path cannot be symbolic/i,
		);
	} finally {
		await cleanup(context);
	}
});

test("policy or mismatched publication authority is rejected", async () => {
	const context = await publicationFixture("authority");
	try {
		for (const authority of [
			{ ...context.authority, kind: "policy" },
			{ ...context.authority, artifactDigest: sha256Ref("different") },
			{ ...context.authority, adapterId: "foreign-adapter:v1" },
		]) {
			assert.throws(
				() =>
					publicationJob(context, {
						plan: {
							pushEventId: context.pushEvent.id,
							target: context.target,
							artifact: context.artifact,
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

test("adapter must declare provider-key idempotency", async () => {
	const context = await publicationFixture("adapter-idempotency");
	try {
		assert.throws(
			() =>
				publicationJob(context, {
					adapter: { ...context.adapter, idempotency: "none" },
				}),
			/adapter identity is invalid/i,
		);
	} finally {
		await cleanup(context);
	}
});

test("scheduled publication identity is immutable after job creation", async () => {
	const context = await publicationFixture("immutable");
	try {
		const plan = {
			pushEventId: context.pushEvent.id,
			target: { ...context.target },
			artifact: { ...context.artifact },
			authority: { ...context.authority },
		};
		const pushEvent = {
			...context.pushEvent,
			refs: [...context.pushEvent.refs],
			data: { ...context.pushEvent.data },
		};
		const job = publicationJob(context, { plan, pushEvent });
		plan.target.destinationRef = "registry:@attacker/package";
		plan.artifact.path = ".codewiki/runtime/publications/artifacts/foreign.tgz";
		plan.authority.actor = "user:attacker";
		pushEvent.data.contentProof = "git-tree:forged";
		const receipt = await job.run(new AbortController().signal);
		assert.equal(receipt.destinationRef, context.target.destinationRef);
		assert.equal(
			context.calls.find((call) => call.kind === "publish")?.input.target
				.destinationRef,
			context.target.destinationRef,
		);
	} finally {
		await cleanup(context);
	}
});

test("mutable supplied push proof cannot replace canonical proof", async () => {
	const context = await publicationFixture("canonical");
	try {
		const pushEvent = {
			...context.pushEvent,
			data: { ...context.pushEvent.data, contentProof: "git-tree:forged" },
		};
		await assert.rejects(
			publicationJob(context, { pushEvent }).run(
				new AbortController().signal,
			),
			/exact canonical push proof/i,
		);
	} finally {
		await cleanup(context);
	}
});

test("malformed adapter operation cannot become publication proof", async () => {
	const context = await publicationFixture("malformed-operation");
	try {
		context.adapter.publish = async () => ({
			operationId: "operation:malformed",
			revision: "revision:malformed",
			artifactDigest: sha256Ref("wrong"),
		});
		await assert.rejects(
			publicationJob(context).run(new AbortController().signal),
			/adapter operation is invalid/i,
		);
		assert.equal(
			(await traceRecords(context)).some(
				(record) => record.event === "runtime.product.published",
			),
			false,
		);
	} finally {
		await cleanup(context);
	}
});

test("adapter failures are redacted and cannot append proof", async () => {
	const context = await publicationFixture("redaction");
	try {
		context.adapter.publish = async () => {
			throw new Error("secret-token-value");
		};
		await assert.rejects(
			publicationJob(context).run(new AbortController().signal),
			(error) => {
				assert.equal(error.message, "Product publication adapter failed.");
				assert.equal(error.message.includes("secret-token-value"), false);
				return true;
			},
		);
	} finally {
		await cleanup(context);
	}
});

test("provider operation mismatch after mutation fails closed", async () => {
	const context = await publicationFixture("post-drift");
	try {
		const publish = context.adapter.publish;
		context.adapter.publish = async (input, signal) => {
			const operation = await publish(input, signal);
			context.state.operationId = "operation:foreign:1";
			return operation;
		};
		await assert.rejects(
			publicationJob(context).run(new AbortController().signal),
			/destination does not match operation proof/i,
		);
		assert.equal(
			(await traceRecords(context)).some(
				(record) => record.event === "runtime.product.published",
			),
			false,
		);
	} finally {
		await cleanup(context);
	}
});
