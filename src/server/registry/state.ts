import {randomUUID} from "node:crypto";
import {constants as fsConstants} from "node:fs";
import {
	chmod,
	mkdir,
	open,
	rename,
	rm,
} from "node:fs/promises";
import {dirname, isAbsolute, join, normalize} from "node:path";
import {
	CLIENT_KINDS,
	type ClientServerActorContext,
	type ClientKind,
	type ClientServerTransportContext,
} from "../../protocol/client-server.ts";
import {
	assertSha256Digest,
	canonicalJson,
	type Sha256Digest,
} from "../../utils/canonical-json.ts";
import {
	normalizeServerAuthenticationAssertion,
	type ServerAuthenticationAssertion,
} from "../authentication/proof.ts";

export const SERVER_REGISTRY_PROTOCOL = Object.freeze({
	id: "codewiki.server-registry",
	version: "1.0.0",
} as const);

const MAX_REGISTRY_RECORDS = 10_000;
const MAX_REGISTRY_BYTES = 4 * 1_024 * 1_024;
const REGISTRY_FILE = "registry.json";
const REGISTRY_LOCK_FILE = "registry.lock";

export type ServerActorKind = "user" | "service";
export type ServerActorStatus = "active" | "disabled";
export type ClientPairingStatus = "active" | "revoked";
export type ServerProjectStatus = "active" | "disabled";

export interface ServerActorRecord {
	readonly actorId: string;
	readonly actorKind: ServerActorKind;
	readonly authenticatedIdentityRefs: readonly string[];
	readonly status: ServerActorStatus;
	readonly createdAt: string;
	readonly updatedAt: string;
}

export interface ClientPairingRecord {
	readonly pairingId: string;
	readonly clientKind: ClientKind;
	readonly clientInstanceId: string;
	readonly authenticationRef: string;
	readonly authenticatedIdentityRef: string;
	readonly actorId: string;
	readonly status: ClientPairingStatus;
	readonly pairedAt: string;
	readonly updatedAt: string;
	readonly expiresAt?: string;
}

export interface ServerProjectRegistration {
	readonly projectId: string;
	readonly repositoryIdentity: Sha256Digest;
	readonly projectRoot: string;
	readonly runtimeRouteRef: string;
	readonly status: ServerProjectStatus;
	readonly registeredAt: string;
	readonly updatedAt: string;
}

export interface ServerRegistrySnapshot {
	readonly protocolId: typeof SERVER_REGISTRY_PROTOCOL.id;
	readonly protocolVersion: typeof SERVER_REGISTRY_PROTOCOL.version;
	readonly generation: number;
	readonly generatedAt: string;
	readonly actors: readonly ServerActorRecord[];
	readonly pairings: readonly ClientPairingRecord[];
	readonly projects: readonly ServerProjectRegistration[];
}

export interface ResolvedServerConnection {
	readonly actor: ClientServerActorContext;
	readonly client: ClientServerTransportContext;
	readonly project: ServerProjectRegistration;
}

export async function readServerRegistrySnapshot(
	serverStateRoot: string,
): Promise<ServerRegistrySnapshot | undefined> {
	const path = registryPath(serverStateRoot);
	let handle;
	try {
		handle = await open(
			path,
			fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0),
		);
	} catch (error) {
		if (isNotFound(error)) return undefined;
		throw error;
	}
	try {
		const metadata = await handle.stat();
		if (
			!metadata.isFile() ||
			metadata.size > MAX_REGISTRY_BYTES ||
			(process.platform !== "win32" && (metadata.mode & 0o077) !== 0)
		) {
			throw new Error(
				"Server registry file is invalid, non-private, or exceeds its byte limit.",
			);
		}
		const bytes = await handle.readFile("utf8");
		let parsed: unknown;
		try {
			parsed = JSON.parse(bytes);
		} catch (error) {
			const reason = error instanceof Error ? error.message : String(error);
			throw new Error(`Server registry JSON is invalid: ${reason}`);
		}
		const snapshot = normalizeServerRegistrySnapshot(parsed);
		if (canonicalJson(snapshot) !== bytes) {
			throw new Error("Server registry file is not canonical JSON.");
		}
		return snapshot;
	} finally {
		await handle.close();
	}
}

export async function writeServerRegistrySnapshot(input: {
	readonly serverStateRoot: string;
	readonly expectedGeneration: number;
	readonly snapshot: ServerRegistrySnapshot;
}): Promise<ServerRegistrySnapshot> {
	if (!Number.isSafeInteger(input.expectedGeneration) || input.expectedGeneration < 0) {
		throw new Error("Server registry expected generation must be a non-negative safe integer.");
	}
	const snapshot = normalizeServerRegistrySnapshot(input.snapshot);
	if (snapshot.generation !== input.expectedGeneration + 1) {
		throw new Error("Server registry next generation must increment expected generation by one.");
	}
	return withRegistryLock(input.serverStateRoot, async () => {
		const current = await readServerRegistrySnapshot(input.serverStateRoot);
		if ((current?.generation ?? 0) !== input.expectedGeneration) {
			throw new Error("Server registry generation conflict.");
		}
		if (current) assertRegistryTransition(current, snapshot);
		await persistRegistry(input.serverStateRoot, snapshot);
		return snapshot;
	});
}

export function normalizeServerRegistrySnapshot(
	value: unknown,
): ServerRegistrySnapshot {
	const input = exactObject(
		value,
		[
			"protocolId",
			"protocolVersion",
			"generation",
			"generatedAt",
			"actors",
			"pairings",
			"projects",
		],
		"Server registry snapshot",
	);
	if (
		input.protocolId !== SERVER_REGISTRY_PROTOCOL.id ||
		input.protocolVersion !== SERVER_REGISTRY_PROTOCOL.version
	) {
		throw new Error("Server registry protocol binding is invalid.");
	}
	const snapshot = Object.freeze({
		protocolId: SERVER_REGISTRY_PROTOCOL.id,
		protocolVersion: SERVER_REGISTRY_PROTOCOL.version,
		generation: integer(input.generation, "generation", 1),
		generatedAt: timestamp(input.generatedAt, "generatedAt"),
		actors: records(input.actors, "actors", normalizeActor),
		pairings: records(input.pairings, "pairings", normalizePairing),
		projects: records(input.projects, "projects", normalizeProject),
	});
	assertRegistryConsistency(snapshot);
	return snapshot;
}

export function resolveServerConnection(input: {
	readonly registry: ServerRegistrySnapshot;
	readonly expectedRegistryGeneration: number;
	readonly authentication: ServerAuthenticationAssertion;
	readonly repositoryIdentity: Sha256Digest;
	readonly now?: Date;
}): ResolvedServerConnection {
	const registry = normalizeServerRegistrySnapshot(input.registry);
	const expectedGeneration = integer(
		input.expectedRegistryGeneration,
		"expectedRegistryGeneration",
		1,
	);
	if (registry.generation !== expectedGeneration) {
		throw new Error("Server registry generation is stale.");
	}
	const authentication = normalizeServerAuthenticationAssertion(input.authentication);
	const repositoryIdentity = assertSha256Digest(
		input.repositoryIdentity,
		"repositoryIdentity",
	);
	const now = input.now ?? new Date();
	if (!Number.isFinite(now.getTime())) {
		throw new Error("Server registry resolution time is invalid.");
	}
	if (Date.parse(registry.generatedAt) > now.getTime()) {
		throw new Error("Server registry snapshot is future-dated.");
	}
	const pairing = activePairing(registry, authentication, now);
	const actor = activeActor(registry, pairing, authentication);
	const project = activeProject(registry, repositoryIdentity);

	return Object.freeze({
		actor: Object.freeze({
			actorId: actor.actorId,
			authenticatedIdentityRef: authentication.authenticatedIdentityRef,
		}),
		client: Object.freeze({
			clientKind: authentication.clientKind,
			clientInstanceId: authentication.clientInstanceId,
			authenticationRef: authentication.authenticationRef,
		}),
		project,
	});
}

function activePairing(
	registry: ServerRegistrySnapshot,
	authentication: ServerAuthenticationAssertion,
	now: Date,
): ClientPairingRecord {
	const pairing = registry.pairings.find(
		(record) => record.authenticationRef === authentication.authenticationRef,
	);
	if (!pairing || pairing.status !== "active") {
		throw new Error("Client pairing is not active.");
	}
	if (
		pairing.clientKind !== authentication.clientKind ||
		pairing.clientInstanceId !== authentication.clientInstanceId ||
		pairing.authenticatedIdentityRef !== authentication.authenticatedIdentityRef
	) {
		throw new Error("Server authentication assertion does not match pairing.");
	}
	if (pairing.expiresAt && Date.parse(pairing.expiresAt) <= now.getTime()) {
		throw new Error("Client pairing has expired.");
	}
	return pairing;
}

function activeActor(
	registry: ServerRegistrySnapshot,
	pairing: ClientPairingRecord,
	authentication: ServerAuthenticationAssertion,
): ServerActorRecord {
	const actor = registry.actors.find(
		(record) => record.actorId === pairing.actorId,
	);
	if (!actor || actor.status !== "active") {
		throw new Error("Server registry actor mapping is not active.");
	}
	if (
		!actor.authenticatedIdentityRefs.includes(
			authentication.authenticatedIdentityRef,
		)
	) {
		throw new Error("Server authenticated identity is not mapped to actor.");
	}
	return actor;
}

function activeProject(
	registry: ServerRegistrySnapshot,
	repositoryIdentity: Sha256Digest,
): ServerProjectRegistration {
	const project = registry.projects.find(
		(record) => record.repositoryIdentity === repositoryIdentity,
	);
	if (!project || project.status !== "active") {
		throw new Error("Server project registration is not active.");
	}
	return project;
}

function normalizeActor(value: unknown, index: number): ServerActorRecord {
	const label = `actors[${index}]`;
	const input = exactObject(
		value,
		[
			"actorId",
			"actorKind",
			"authenticatedIdentityRefs",
			"status",
			"createdAt",
			"updatedAt",
		],
		label,
	);
	const actorKind = choice(input.actorKind, `${label}.actorKind`, [
		"user",
		"service",
	] as const);
	const status = choice(input.status, `${label}.status`, [
		"active",
		"disabled",
	] as const);
	return Object.freeze({
		actorId: text(input.actorId, `${label}.actorId`),
		actorKind,
		authenticatedIdentityRefs: uniqueTextArray(
			input.authenticatedIdentityRefs,
			`${label}.authenticatedIdentityRefs`,
		),
		status,
		createdAt: timestamp(input.createdAt, `${label}.createdAt`),
		updatedAt: timestamp(input.updatedAt, `${label}.updatedAt`),
	});
}

function normalizePairing(
	value: unknown,
	index: number,
): ClientPairingRecord {
	const label = `pairings[${index}]`;
	const input = exactObject(
		value,
		[
			"pairingId",
			"clientKind",
			"clientInstanceId",
			"authenticationRef",
			"authenticatedIdentityRef",
			"actorId",
			"status",
			"pairedAt",
			"updatedAt",
			"expiresAt",
		],
		label,
	);
	const clientKind = choice(
		input.clientKind,
		`${label}.clientKind`,
		CLIENT_KINDS,
	);
	const status = choice(input.status, `${label}.status`, [
		"active",
		"revoked",
	] as const);
	return Object.freeze({
		pairingId: text(input.pairingId, `${label}.pairingId`),
		clientKind,
		clientInstanceId: text(
			input.clientInstanceId,
			`${label}.clientInstanceId`,
		),
		authenticationRef: text(
			input.authenticationRef,
			`${label}.authenticationRef`,
			4_096,
		),
		authenticatedIdentityRef: text(
			input.authenticatedIdentityRef,
			`${label}.authenticatedIdentityRef`,
			4_096,
		),
		actorId: text(input.actorId, `${label}.actorId`),
		status,
		pairedAt: timestamp(input.pairedAt, `${label}.pairedAt`),
		updatedAt: timestamp(input.updatedAt, `${label}.updatedAt`),
		...(input.expiresAt === undefined
			? {}
			: {expiresAt: timestamp(input.expiresAt, `${label}.expiresAt`)}),
	});
}

function normalizeProject(
	value: unknown,
	index: number,
): ServerProjectRegistration {
	const label = `projects[${index}]`;
	const input = exactObject(
		value,
		[
			"projectId",
			"repositoryIdentity",
			"projectRoot",
			"runtimeRouteRef",
			"status",
			"registeredAt",
			"updatedAt",
		],
		label,
	);
	const status = choice(input.status, `${label}.status`, [
		"active",
		"disabled",
	] as const);
	return Object.freeze({
		projectId: text(input.projectId, `${label}.projectId`),
		repositoryIdentity: assertSha256Digest(
			input.repositoryIdentity,
			`${label}.repositoryIdentity`,
		),
		projectRoot: absolutePath(input.projectRoot, `${label}.projectRoot`),
		runtimeRouteRef: text(
			input.runtimeRouteRef,
			`${label}.runtimeRouteRef`,
			4_096,
		),
		status,
		registeredAt: timestamp(input.registeredAt, `${label}.registeredAt`),
		updatedAt: timestamp(input.updatedAt, `${label}.updatedAt`),
	});
}

function assertRegistryConsistency(registry: ServerRegistrySnapshot): void {
	assertRegistryUniqueKeys(registry);
	const actorById = new Map(
		registry.actors.map((record) => [record.actorId, record]),
	);
	assertStableActorIdentities(registry.actors);
	assertPairingMappings(registry.pairings, actorById);
	assertRegistryChronology(registry);
}

function assertRegistryUniqueKeys(registry: ServerRegistrySnapshot): void {
	assertUnique(registry.actors, (record) => record.actorId, "actorId");
	assertUnique(registry.projects, (record) => record.projectId, "projectId");
	assertUnique(
		registry.projects,
		(record) => record.repositoryIdentity,
		"repositoryIdentity",
	);
	assertUnique(
		registry.projects,
		(record) => record.runtimeRouteRef,
		"runtimeRouteRef",
	);
	assertUnique(registry.pairings, (record) => record.pairingId, "pairingId");
	assertUnique(
		registry.pairings,
		(record) => record.authenticationRef,
		"authenticationRef",
	);
}

function assertStableActorIdentities(actors: readonly ServerActorRecord[]): void {
	const actorByIdentity = new Map<string, string>();
	for (const actor of actors) {
		for (const identityRef of actor.authenticatedIdentityRefs) {
			const existing = actorByIdentity.get(identityRef);
			if (existing && existing !== actor.actorId) {
				throw new Error(
					`Server registry authenticated identity ${identityRef} maps to multiple actors.`,
				);
			}
			actorByIdentity.set(identityRef, actor.actorId);
		}
	}
}

function assertPairingMappings(
	pairings: readonly ClientPairingRecord[],
	actorById: ReadonlyMap<string, ServerActorRecord>,
): void {
	const activeClientInstances = new Set<string>();
	for (const pairing of pairings) {
		const actor = actorById.get(pairing.actorId);
		if (!actor) {
			throw new Error(`Client pairing ${pairing.pairingId} references unknown actor.`);
		}
		if (!actor.authenticatedIdentityRefs.includes(pairing.authenticatedIdentityRef)) {
			throw new Error(
				`Client pairing ${pairing.pairingId} identity does not match actor mapping.`,
			);
		}
		if (pairing.status !== "active") continue;
		const key = `${pairing.clientKind}\u0000${pairing.clientInstanceId}`;
		if (activeClientInstances.has(key)) {
			throw new Error(
				"Server registry has multiple active pairings for one client instance.",
			);
		}
		activeClientInstances.add(key);
	}
}

function assertRegistryChronology(registry: ServerRegistrySnapshot): void {
	for (const actor of registry.actors) {
		assertChronology(actor.createdAt, actor.updatedAt, registry.generatedAt, "actor");
	}
	for (const pairing of registry.pairings) {
		assertChronology(
			pairing.pairedAt,
			pairing.updatedAt,
			registry.generatedAt,
			"pairing",
		);
		if (pairing.expiresAt && Date.parse(pairing.expiresAt) <= Date.parse(pairing.pairedAt)) {
			throw new Error("Client pairing expiry chronology is invalid.");
		}
	}
	for (const project of registry.projects) {
		assertChronology(
			project.registeredAt,
			project.updatedAt,
			registry.generatedAt,
			"project",
		);
	}
}

function assertChronology(
	createdAt: string,
	updatedAt: string,
	generatedAt: string,
	label: string,
): void {
	if (Date.parse(createdAt) > Date.parse(updatedAt) || Date.parse(updatedAt) > Date.parse(generatedAt)) {
		throw new Error(`Server registry ${label} chronology is invalid.`);
	}
}

function assertRegistryTransition(
	current: ServerRegistrySnapshot,
	next: ServerRegistrySnapshot,
): void {
	if (Date.parse(next.generatedAt) <= Date.parse(current.generatedAt)) {
		throw new Error("Server registry generatedAt must advance with generation.");
	}
	assertActorTransition(current.actors, next.actors);
	assertPairingTransition(current.pairings, next.pairings);
	assertProjectTransition(current.projects, next.projects);
}

function assertActorTransition(
	current: readonly ServerActorRecord[],
	next: readonly ServerActorRecord[],
): void {
	const nextById = new Map(next.map((record) => [record.actorId, record]));
	for (const existing of current) {
		const replacement = nextById.get(existing.actorId);
		if (!replacement) throw new Error("Server registry cannot delete an actor record.");
		if (replacement.actorKind !== existing.actorKind) {
			throw new Error("Server registry cannot change actor kind.");
		}
		for (const identityRef of existing.authenticatedIdentityRefs) {
			if (!replacement.authenticatedIdentityRefs.includes(identityRef)) {
				throw new Error("Server registry cannot remove an actor identity mapping.");
			}
		}
		assertUpdatedAtTransition(
			existing.updatedAt,
			replacement.updatedAt,
			existing.status !== replacement.status ||
				existing.authenticatedIdentityRefs.length !==
					replacement.authenticatedIdentityRefs.length,
			"actor",
		);
		assertStatusDoesNotReactivate(existing.status, replacement.status, "actor");
	}
}

function assertPairingTransition(
	current: readonly ClientPairingRecord[],
	next: readonly ClientPairingRecord[],
): void {
	const nextById = new Map(next.map((record) => [record.pairingId, record]));
	for (const existing of current) {
		const replacement = nextById.get(existing.pairingId);
		if (!replacement) throw new Error("Server registry cannot delete a pairing record.");
		for (const field of [
			"clientKind",
			"clientInstanceId",
			"authenticationRef",
			"authenticatedIdentityRef",
			"actorId",
			"pairedAt",
			"expiresAt",
		] as const) {
			if (replacement[field] !== existing[field]) {
				throw new Error(`Server registry cannot change pairing ${field}.`);
			}
		}
		assertUpdatedAtTransition(
			existing.updatedAt,
			replacement.updatedAt,
			existing.status !== replacement.status,
			"pairing",
		);
		assertStatusDoesNotReactivate(existing.status, replacement.status, "pairing");
	}
}

function assertProjectTransition(
	current: readonly ServerProjectRegistration[],
	next: readonly ServerProjectRegistration[],
): void {
	const nextById = new Map(next.map((record) => [record.projectId, record]));
	for (const existing of current) {
		const replacement = nextById.get(existing.projectId);
		if (!replacement) throw new Error("Server registry cannot delete a project record.");
		for (const field of [
			"repositoryIdentity",
			"projectRoot",
			"runtimeRouteRef",
			"registeredAt",
		] as const) {
			if (replacement[field] !== existing[field]) {
				throw new Error(`Server registry cannot change project ${field}.`);
			}
		}
		assertUpdatedAtTransition(
			existing.updatedAt,
			replacement.updatedAt,
			existing.status !== replacement.status,
			"project",
		);
		assertStatusDoesNotReactivate(existing.status, replacement.status, "project");
	}
}

function assertUpdatedAtTransition(
	current: string,
	next: string,
	changed: boolean,
	label: string,
): void {
	if (Date.parse(next) < Date.parse(current)) {
		throw new Error(`Server registry ${label} updatedAt cannot move backward.`);
	}
	if (changed && Date.parse(next) <= Date.parse(current)) {
		throw new Error(`Server registry ${label} update must advance updatedAt.`);
	}
}

function assertStatusDoesNotReactivate(
	current: string,
	next: string,
	label: string,
): void {
	if ((current === "disabled" || current === "revoked") && next === "active") {
		throw new Error(`Server registry cannot reactivate ${label} record.`);
	}
}

async function withRegistryLock<T>(
	serverStateRoot: string,
	run: () => Promise<T>,
): Promise<T> {
	const path = join(serverStateRoot, REGISTRY_LOCK_FILE);
	await mkdir(serverStateRoot, {recursive: true, mode: 0o700});
	let handle;
	try {
		handle = await open(path, "wx", 0o600);
	} catch (error) {
		if (isAlreadyExists(error)) {
			throw new Error("Another Server registry write is in progress.");
		}
		throw error;
	}
	try {
		return await run();
	} finally {
		await handle.close();
		await rm(path, {force: true});
	}
}

async function persistRegistry(
	serverStateRoot: string,
	snapshot: ServerRegistrySnapshot,
): Promise<void> {
	const path = registryPath(serverStateRoot);
	const temporary = `${path}.tmp-${process.pid}-${randomUUID()}`;
	const bytes = canonicalJson(snapshot);
	if (Buffer.byteLength(bytes) > MAX_REGISTRY_BYTES) {
		throw new Error("Server registry file exceeds its byte limit.");
	}
	let handle;
	try {
		handle = await open(temporary, "wx", 0o600);
		await handle.writeFile(bytes, "utf8");
		await handle.sync();
		await handle.close();
		handle = undefined;
		await rename(temporary, path);
		if (process.platform !== "win32") {
			await chmod(path, 0o600);
			const directory = await open(dirname(path), "r");
			try {
				await directory.sync();
			} finally {
				await directory.close();
			}
		}
	} finally {
		await handle?.close();
		await rm(temporary, {force: true});
	}
}

function registryPath(serverStateRoot: string): string {
	if (!isAbsolute(serverStateRoot)) {
		throw new Error("Server state root must be absolute.");
	}
	return join(serverStateRoot, REGISTRY_FILE);
}

function records<T>(
	value: unknown,
	field: string,
	normalize: (entry: unknown, index: number) => T,
): readonly T[] {
	if (!Array.isArray(value) || value.length > MAX_REGISTRY_RECORDS) {
		throw new Error(
			`${field} must be an array with at most ${MAX_REGISTRY_RECORDS} records.`,
		);
	}
	return Object.freeze(value.map(normalize));
}

function uniqueTextArray(value: unknown, field: string): readonly string[] {
	if (!Array.isArray(value) || value.length === 0 || value.length > 100) {
		throw new Error(`${field} must contain between 1 and 100 entries.`);
	}
	const normalized = value.map((entry, index) =>
		text(entry, `${field}[${index}]`, 4_096),
	);
	if (new Set(normalized).size !== normalized.length) {
		throw new Error(`${field} must contain unique entries.`);
	}
	return Object.freeze(normalized);
}

function assertUnique<T>(
	records: readonly T[],
	key: (record: T) => string,
	field: string,
): void {
	const seen = new Set<string>();
	for (const record of records) {
		const value = key(record);
		if (seen.has(value)) {
			throw new Error(`Server registry ${field} values must be unique.`);
		}
		seen.add(value);
	}
}

function exactObject(
	value: unknown,
	fields: readonly string[],
	label: string,
): Record<string, unknown> {
	if (
		typeof value !== "object" ||
		value === null ||
		Array.isArray(value) ||
		Object.getPrototypeOf(value) !== Object.prototype
	) {
		throw new Error(`${label} must be a plain object.`);
	}
	const input = value as Record<string, unknown>;
	for (const key of Object.keys(input)) {
		if (!fields.includes(key)) {
			throw new Error(`${label} received unsupported field ${key}.`);
		}
	}
	return input;
}

function text(value: unknown, field: string, maximum = 512): string {
	if (
		typeof value !== "string" ||
		value.trim() !== value ||
		value.length === 0 ||
		value.length > maximum
	) {
		throw new Error(`${field} must be bounded non-empty text.`);
	}
	return value;
}

function absolutePath(value: unknown, field: string): string {
	const path = text(value, field, 4_096);
	if (!isAbsolute(path) || normalize(path) !== path || path.includes("\u0000")) {
		throw new Error(`${field} must be a normalized absolute path.`);
	}
	return path;
}

function timestamp(value: unknown, field: string): string {
	const normalized = text(value, field, 64);
	const date = new Date(normalized);
	if (
		!Number.isFinite(date.getTime()) ||
		date.toISOString() !== normalized
	) {
		throw new Error(`${field} must be an exact ISO timestamp.`);
	}
	return normalized;
}

function integer(value: unknown, field: string, minimum: number): number {
	if (!Number.isSafeInteger(value) || (value as number) < minimum) {
		throw new Error(`${field} must be a safe integer of at least ${minimum}.`);
	}
	return value as number;
}

function choice<const T extends readonly string[]>(
	value: unknown,
	field: string,
	choices: T,
): T[number] {
	if (typeof value !== "string" || !choices.includes(value)) {
		throw new Error(`${field} is unsupported.`);
	}
	return value as T[number];
}

function isNotFound(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		error.code === "ENOENT"
	);
}

function isAlreadyExists(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		error.code === "EEXIST"
	);
}
