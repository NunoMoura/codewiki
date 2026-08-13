import assert from "node:assert/strict";
import {
	chmodSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";

import {
	projectCoordinatorEndpointPath,
	projectCoordinatorOwnershipPath,
	readProjectCoordinatorEndpoint,
} from "../../src/runtime/coordinator/endpoint.ts";
import {
	connectProjectCoordinatorClient,
	requestProjectCoordinatorHealth,
	startProjectCoordinatorService,
} from "../../src/runtime/coordinator/service.ts";

function deferred() {
	let resolve;
	const promise = new Promise((resolvePromise) => {
		resolve = resolvePromise;
	});
	return { promise, resolve };
}

function delay(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForChildLine(child, timeoutMs = 5_000) {
	return new Promise((resolve, reject) => {
		let stdout = "";
		let stderr = "";
		const timeout = setTimeout(() => {
			cleanup();
			reject(new Error(`Timed out waiting for coordinator child. STDERR:\n${stderr}`));
		}, timeoutMs);
		const onStdout = (chunk) => {
			stdout += chunk;
			const newline = stdout.indexOf("\n");
			if (newline < 0) return;
			cleanup();
			resolve(stdout.slice(0, newline));
		};
		const onStderr = (chunk) => {
			stderr += chunk;
		};
		const onExit = (code, signal) => {
			cleanup();
			reject(
				new Error(
					`Coordinator child exited before ready: code=${code} signal=${signal}\n${stderr}`,
				),
			);
		};
		const cleanup = () => {
			clearTimeout(timeout);
			child.stdout.off("data", onStdout);
			child.stderr.off("data", onStderr);
			child.off("exit", onExit);
		};
		child.stdout.on("data", onStdout);
		child.stderr.on("data", onStderr);
		child.once("exit", onExit);
	});
}

async function waitForExit(child) {
	if (child.exitCode !== null || child.signalCode !== null) return;
	await new Promise((resolve) => child.once("exit", resolve));
}

test("coordinator service authenticates loopback clients and shares supervision", async () => {
	const root = mkdtempSync(join(tmpdir(), "codewiki-coordinator-service-"));
	let service;
	try {
		service = await startProjectCoordinatorService(root, {
			generationId: "generation:service",
			clientLeaseMs: 1_000,
		});
		assert.equal(service.endpoint.origin.startsWith("http://127.0.0.1:"), true);
		assert.deepEqual(
			await readProjectCoordinatorEndpoint(root),
			service.endpoint,
		);
		if (process.platform !== "win32") {
			assert.equal(
				statSync(projectCoordinatorEndpointPath(root)).mode & 0o777,
				0o600,
			);
			assert.equal(
				statSync(projectCoordinatorOwnershipPath(root)).mode & 0o777,
				0o600,
			);
		}

		const unauthorized = await fetch(`${service.endpoint.origin}/v1/state`);
		assert.equal(unauthorized.status, 403);
		const queryToken = await fetch(
			`${service.endpoint.origin}/v1/state?token=${service.endpoint.token}`,
		);
		assert.equal(queryToken.status, 403);
		const wrongGeneration = await fetch(`${service.endpoint.origin}/v1/state`, {
			headers: {
				authorization: `Bearer ${service.endpoint.token}`,
				"x-codewiki-generation": "generation:wrong",
			},
		});
		assert.equal(wrongGeneration.status, 403);
		const unknownField = await fetch(
			`${service.endpoint.origin}/v1/clients/connect`,
			{
				method: "POST",
				headers: {
					authorization: `Bearer ${service.endpoint.token}`,
					"content-type": "application/json",
					"x-codewiki-generation": service.endpoint.generationId,
				},
				body: JSON.stringify({
					clientId: "invalid",
					kind: "test",
					authority: "self-granted",
				}),
			},
		);
		assert.equal(unknownField.status, 400);
		assert.deepEqual(await unknownField.json(), {
			error: "unsupported_field:authority",
		});

		const dashboard = await connectProjectCoordinatorClient(root, {
			clientId: "dashboard:service",
			kind: "dashboard",
		});
		const pi = await connectProjectCoordinatorClient(root, {
			clientId: "pi:service",
			kind: "pi",
			supervision: "approved",
		});
		const context = {
			actor: {actorId: "user:service", authenticatedIdentityRef: "identity:service"},
			client: {clientKind: "app", clientInstanceId: "app:service", authenticationRef: "auth:service"},
		};
		const state = await dashboard.state();
		assert.equal(state.generationId, "generation:service");
		assert.equal(state.clientCount, 2);
		assert.equal(state.supervisorCount, 1);
		assert.equal(state.executionPermitted, true);
		assert.equal((await dashboard.appState(context)).projectRoot, root);
		assert.deepEqual((await dashboard.changes(context)).records, []);
		assert.equal((await dashboard.configuration(context)).validation, "valid");
		assert.throws(
			() => dashboard.appState({...context, authority: "admin"}),
			/unsupported field authority/,
		);
		const callerSelected = await fetch(
			`${service.endpoint.origin}/v1/runtime/react`,
			{
				method: "POST",
				headers: {
					authorization: `Bearer ${service.endpoint.token}`,
					"content-type": "application/json",
					"x-codewiki-generation": service.endpoint.generationId,
				},
				body: JSON.stringify({
					connectionId: dashboard.connectionId,
					trigger: { kind: "manual_resume" },
					selection: { loop: "decision", changeId: "CHG-forged" },
				}),
			},
		);
		assert.equal(callerSelected.status, 400);
		assert.deepEqual(await callerSelected.json(), {
			error: "unsupported_field:selection",
		});
		const callerTimed = await fetch(
			`${service.endpoint.origin}/v1/runtime/react`,
			{
				method: "POST",
				headers: {
					authorization: `Bearer ${service.endpoint.token}`,
					"content-type": "application/json",
					"x-codewiki-generation": service.endpoint.generationId,
				},
				body: JSON.stringify({
					connectionId: dashboard.connectionId,
					trigger: {
						kind: "manual_resume",
						occurredAt: "2099-01-01T00:00:00.000Z",
					},
				}),
			},
		);
		assert.equal(callerTimed.status, 400);
		assert.deepEqual(await callerTimed.json(), {
			error: "unsupported_field:occurredAt",
		});
		await assert.rejects(
			() => dashboard.react({ kind: "manual_resume" }),
			/semantic_adapters_unavailable/,
		);

		const result = await service.coordinator.schedule({
			idempotencyKey: "decision:service",
			lane: {
				kind: "decision",
				changeId: "CHG-service",
				changeRevisionId: `sha256:${"1".repeat(64)}`,
			},
			run: () => "executed",
		});
		assert.equal(result, "executed");
		await pi.disconnect();
		const release = deferred();
		let started = false;
		const held = service.coordinator.schedule({
			idempotencyKey: "decision:held",
			lane: {
				kind: "decision",
				changeId: "CHG-held",
				changeRevisionId: `sha256:${"2".repeat(64)}`,
			},
			async run() {
				started = true;
				await release.promise;
				return "released";
			},
		});
		await delay(20);
		assert.equal(started, false);
		assert.equal(service.coordinator.snapshot().jobs[0].heldReason, "supervision_required");
		const replacement = await connectProjectCoordinatorClient(root, {
			clientId: "pi:replacement",
			kind: "pi",
			supervision: "approved",
		});
		await delay(20);
		assert.equal(started, true);
		release.resolve();
		assert.equal(await held, "released");

		await replacement.disconnect();
		await dashboard.disconnect();
		await service.close();
		service = undefined;
		assert.equal(await readProjectCoordinatorEndpoint(root), undefined);
	} finally {
		await service?.close().catch(() => undefined);
		rmSync(root, { recursive: true, force: true });
	}
});

test("coordinator client leases expire unless heartbeat extends them", async () => {
	const root = mkdtempSync(join(tmpdir(), "codewiki-coordinator-lease-"));
	let service;
	let now = 0;
	try {
		service = await startProjectCoordinatorService(root, {
			generationId: "generation:lease",
			clientLeaseMs: 1_000,
			clock: () => now,
		});
		const client = await connectProjectCoordinatorClient(root, {
			clientId: "pi:lease",
			kind: "pi",
			supervision: "approved",
		});
		now = 400;
		await client.heartbeat();
		now = 1_399;
		assert.equal((await client.state()).clientCount, 1);
		now = 1_401;
		assert.equal((await client.state()).clientCount, 0);
		await assert.rejects(client.heartbeat(), /client_connection_not_found/);
		await client.disconnect().catch(() => undefined);
		await service.close();
		service = undefined;
	} finally {
		await service?.close().catch(() => undefined);
		rmSync(root, { recursive: true, force: true });
	}
});

test("coordinator service provides leased bounded event replay and long polling", async () => {
	const root = mkdtempSync(join(tmpdir(), "codewiki-coordinator-events-"));
	let service;
	let first;
	let second;
	try {
		service = await startProjectCoordinatorService(root, {
			generationId: "generation:event-service",
		});
		first = await connectProjectCoordinatorClient(root, {
			clientId: "pi:event-reader",
			kind: "pi",
			supervision: "approved",
		});
		const initial = await first.events(0);
		assert.equal(initial.generationId, "generation:event-service");
		assert.equal(initial.resetRequired, false);
		assert.deepEqual(initial.events.map((event) => event.state), [
			"client_connected",
		]);
		const inspected = await first.inspect({ kind: "project_truth_changed" });
		const observed = await first.events(initial.latestCursor);
		assert.equal(observed.events[0].state, "work_state_observed");
		assert.equal(
			observed.events[0].workStateDigest,
			inspected.observedWorkStateDigest,
		);
		const pending = first.events(observed.latestCursor, { waitMs: 1_000 });
		second = await connectProjectCoordinatorClient(root, {
			clientId: "dashboard:event-source",
			kind: "dashboard",
			supervision: "observer",
		});
		const delivered = await pending;
		assert.deepEqual(delivered.events.map((event) => event.state), [
			"client_connected",
		]);
		assert.equal(delivered.events[0].clientId, "dashboard:event-source");
	} finally {
		if (second) await second.disconnect().catch(() => undefined);
		if (first) await first.disconnect().catch(() => undefined);
		if (service) await service.close().catch(() => undefined);
		rmSync(root, { recursive: true, force: true });
	}
});

test("coordinator ownership rejects a second live generation and fences stale owners", async () => {
	const root = mkdtempSync(join(tmpdir(), "codewiki-coordinator-fence-"));
	let service;
	try {
		service = await startProjectCoordinatorService(root, {
			generationId: "generation:owner",
			executionPolicy: "unattended",
		});
		await assert.rejects(
			startProjectCoordinatorService(root, {
				generationId: "generation:contender",
			}),
			/already running/,
		);

		const lockPath = projectCoordinatorOwnershipPath(root);
		const ownership = JSON.parse(readFileSync(lockPath, "utf8"));
		writeFileSync(
			lockPath,
			`${JSON.stringify({
				...ownership,
				generationId: "generation:replacement",
				ownerNonce: "replacement-owner",
			})}\n`,
			{ mode: 0o600 },
		);
		if (process.platform !== "win32") chmodSync(lockPath, 0o600);
		await assert.rejects(
			requestProjectCoordinatorHealth(service.endpoint),
			/stale_generation/,
		);
		await service.close();
		service = undefined;
	} finally {
		await service?.close().catch(() => undefined);
		rmSync(root, { recursive: true, force: true });
	}
});

test("dead coordinator ownership is replaced without reusing its generation", async () => {
	const root = mkdtempSync(join(tmpdir(), "codewiki-coordinator-takeover-"));
	let child;
	let replacement;
	try {
		child = spawn(
			process.execPath,
			[
				"--experimental-strip-types",
				join(process.cwd(), "tests", "runtime", "project-coordinator-service-host.mjs"),
				root,
			],
			{ stdio: ["ignore", "pipe", "pipe"] },
		);
		const childReady = JSON.parse(await waitForChildLine(child));
		const firstEndpoint = await readProjectCoordinatorEndpoint(root);
		assert.equal(firstEndpoint.generationId, childReady.generationId);
		const firstClient = await connectProjectCoordinatorClient(root, {
			clientId: "dashboard:child",
			kind: "dashboard",
		});
		assert.equal((await firstClient.state()).clientCount, 1);

		child.kill(process.platform === "win32" ? undefined : "SIGKILL");
		await waitForExit(child);
		child = undefined;
		replacement = await startProjectCoordinatorService(root, {
			generationId: "generation:takeover",
			executionPolicy: "unattended",
		});
		assert.notEqual(replacement.endpoint.generationId, childReady.generationId);
		assert.equal(
			(await readProjectCoordinatorEndpoint(root)).generationId,
			"generation:takeover",
		);
		assert.equal((await requestProjectCoordinatorHealth(replacement.endpoint)).pid, process.pid);
		await replacement.close();
		replacement = undefined;
	} finally {
		if (child) {
			child.kill(process.platform === "win32" ? undefined : "SIGKILL");
			await waitForExit(child).catch(() => undefined);
		}
		await replacement?.close().catch(() => undefined);
		rmSync(root, { recursive: true, force: true });
	}
});
