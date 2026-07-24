import {
	runOciContainerCommand,
	type OciContainerCommandRunner,
} from "./oci-container-command.ts";

const DEFAULT_WORKER_COMMAND = ["/usr/local/bin/codewiki-worker"] as const;
const DEFAULT_TIMEOUT_MS = 30 * 60_000;
const DEFAULT_TERMINATION_GRACE_MS = 5_000;
const DEFAULT_MAX_OUTPUT_BYTES = 1024 * 1024;
const OCI_IMAGE = /^[a-zA-Z0-9][a-zA-Z0-9._/:@-]*@sha256:[a-f0-9]{64}$/u;
const ENVIRONMENT_NAME = /^[A-Z_][A-Z0-9_]*$/u;
const RESERVED_RUNTIME_ENVIRONMENT = /^(?:DOCKER_|PODMAN_|CONTAINER_|PATH$|HOME$|XDG_CONFIG_HOME$|TMPDIR$|TMP$|TEMP$)/u;

export interface OciContainerWorkerAdapterOptions {
	image: string;
	runtime?: "docker" | "podman";
	workerCommand?: readonly string[];
	environment?: Readonly<Record<string, string | undefined>>;
	network?: string;
	user?: string;
	memoryBytes?: number;
	cpus?: number;
	pidsLimit?: number;
	tmpfsBytes?: number;
	timeoutMs?: number;
	terminationGraceMs?: number;
	maxOutputBytes?: number;
	runner?: OciContainerCommandRunner;
}

export interface ResolvedContainerOptions {
	image: string;
	runtime: "docker" | "podman";
	workerCommand: string[];
	environment: Record<string, string>;
	network: string;
	user: string;
	memoryBytes: number;
	cpus: number;
	pidsLimit: number;
	tmpfsBytes: number;
	timeoutMs: number;
	terminationGraceMs: number;
	maxOutputBytes: number;
	runner: OciContainerCommandRunner;
}

export function resolveContainerOptions(
	options: OciContainerWorkerAdapterOptions,
): ResolvedContainerOptions {
	if (!OCI_IMAGE.test(options.image)) {
		throw new Error(
			"Implementation container image must use an immutable sha256 digest.",
		);
	}
	const workerCommand = [...(options.workerCommand || DEFAULT_WORKER_COMMAND)];
	if (
		workerCommand.length === 0 ||
		workerCommand.length > 32 ||
		workerCommand.some(
			(value) => !value || value.length > 512 || value.includes("\0"),
		)
	) {
		throw new Error("Implementation container worker command is invalid.");
	}
	const environment: Record<string, string> = {};
	const environmentEntries = Object.entries(options.environment || {});
	if (environmentEntries.length > 64) {
		throw new Error("Implementation container environment exceeds 64 entries.");
	}
	for (const [name, value] of environmentEntries) {
		if (
			!ENVIRONMENT_NAME.test(name) ||
			RESERVED_RUNTIME_ENVIRONMENT.test(name)
		) {
			throw new Error(
				`Implementation container environment name ${name} is invalid.`,
			);
		}
		if (value !== undefined) {
			if (Buffer.byteLength(value, "utf8") > 16 * 1024) {
				throw new Error(
					`Implementation container environment value ${name} is too large.`,
				);
			}
			environment[name] = value;
		}
	}
	const network = options.network || "none";
	if (
		!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/u.test(network) ||
		network === "host" ||
		network === "bridge" ||
		network === "default"
	) {
		throw new Error(
			"Implementation container network must be none or a named restricted network.",
		);
	}
	const user = options.user || hostContainerUser();
	if (!/^\d+:\d+$/u.test(user)) {
		throw new Error("Implementation container user must be a numeric uid:gid.");
	}
	return {
		image: options.image,
		runtime: options.runtime || "docker",
		workerCommand,
		environment,
		network,
		user,
		memoryBytes: boundedInteger(
			options.memoryBytes,
			2 * 1024 * 1024 * 1024,
			64 * 1024 * 1024,
			64 * 1024 * 1024 * 1024,
		),
		cpus: boundedNumber(options.cpus, 2, 0.1, 64),
		pidsLimit: boundedInteger(options.pidsLimit, 256, 16, 4_096),
		tmpfsBytes: boundedInteger(
			options.tmpfsBytes,
			256 * 1024 * 1024,
			1024 * 1024,
			8 * 1024 * 1024 * 1024,
		),
		timeoutMs: boundedInteger(
			options.timeoutMs,
			DEFAULT_TIMEOUT_MS,
			1_000,
			24 * 60 * 60_000,
		),
		terminationGraceMs: boundedInteger(
			options.terminationGraceMs,
			DEFAULT_TERMINATION_GRACE_MS,
			100,
			60_000,
		),
		maxOutputBytes: boundedInteger(
			options.maxOutputBytes,
			DEFAULT_MAX_OUTPUT_BYTES,
			1024,
			8 * 1024 * 1024,
		),
		runner: options.runner || runOciContainerCommand,
	};
}

export function containerRuntimeEnvironment(
	containerEnvironment: Readonly<Record<string, string>>,
): NodeJS.ProcessEnv {
	const environment: NodeJS.ProcessEnv = {};
	for (const name of [
		"PATH",
		"PATHEXT",
		"SystemRoot",
		"WINDIR",
		"TMPDIR",
		"TMP",
		"TEMP",
	]) {
		if (process.env[name] !== undefined) environment[name] = process.env[name];
	}
	return { ...environment, ...containerEnvironment };
}

function boundedInteger(
	value: number | undefined,
	fallback: number,
	minimum: number,
	maximum: number,
): number {
	const resolved = value === undefined ? fallback : value;
	if (
		!Number.isSafeInteger(resolved) ||
		resolved < minimum ||
		resolved > maximum
	) {
		throw new Error("Implementation container integer limit is invalid.");
	}
	return resolved;
}

function boundedNumber(
	value: number | undefined,
	fallback: number,
	minimum: number,
	maximum: number,
): number {
	const resolved = value === undefined ? fallback : value;
	if (!Number.isFinite(resolved) || resolved < minimum || resolved > maximum) {
		throw new Error("Implementation container numeric limit is invalid.");
	}
	return resolved;
}

function hostContainerUser(): string {
	const uid = typeof process.getuid === "function" ? process.getuid() : 65_532;
	const gid = typeof process.getgid === "function" ? process.getgid() : 65_532;
	return `${uid}:${gid}`;
}
