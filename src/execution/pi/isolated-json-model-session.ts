import type {
	CreateAgentSessionOptions,
	ResourceLoader,
} from "@earendil-works/pi-coding-agent";
import type {createAgentSession as createPiAgentSession} from "@earendil-works/pi-coding-agent";
import {join} from "node:path";
import type {WikiModelRouteConfig} from "../../project/model-routing.ts";

type PiIsolatedJsonModelRoute = Pick<
	WikiModelRouteConfig,
	"id" | "provider" | "model" | "thinking" | "timeoutMs"
>;
type PiSdkModule = typeof import("@earendil-works/pi-coding-agent");
type PiModelRuntime = NonNullable<
	PiIsolatedJsonModelSdkOptions["modelRuntime"]
>;
type PiModel = NonNullable<ReturnType<PiModelRuntime["getModel"]>>;

interface LoadedPiModel {
	readonly piSdk: PiSdkModule;
	readonly agentDir: string;
	readonly modelRuntime: PiModelRuntime;
	readonly model: PiModel;
}

export interface PiIsolatedJsonModelSession {
	prompt(text: string): Promise<void>;
	readResponse(): unknown;
	abort?(): void | Promise<void>;
	dispose(): void | Promise<void>;
}

interface PiIsolatedJsonModelSessionFactoryInput {
	readonly repoRoot: string;
	readonly route: PiIsolatedJsonModelRoute;
	readonly systemPrompt: string;
	readonly responseLimit: number;
	readonly responseLabel: string;
}

export type PiIsolatedJsonModelSessionFactory = (
	input: PiIsolatedJsonModelSessionFactoryInput,
) => Promise<PiIsolatedJsonModelSession>;

export interface PiIsolatedJsonModelSdkOptions {
	readonly piSdk?: PiSdkModule;
	readonly agentDir?: string;
	readonly modelRuntime?: CreateAgentSessionOptions["modelRuntime"];
	readonly createAgentSession?: typeof createPiAgentSession;
}

type PiIsolatedJsonModelOutcome =
	| {readonly status: "completed"; readonly response: unknown}
	| {
			readonly status:
				| "malformed_output"
				| "timeout"
				| "provider_failure"
				| "unavailable"
				| "cancelled";
	  };

export async function runPiIsolatedJsonModelSession(input: {
	readonly repoRoot: string;
	readonly route: PiIsolatedJsonModelRoute;
	readonly systemPrompt: string;
	readonly invocationPrompt: string;
	readonly responseLimit: number;
	readonly responseLabel: string;
	readonly sessionFactory: PiIsolatedJsonModelSessionFactory;
	readonly signal?: AbortSignal;
}): Promise<PiIsolatedJsonModelOutcome> {
	assertSessionInput(input);
	if (input.signal?.aborted) return Object.freeze({status: "cancelled"});
	let session: PiIsolatedJsonModelSession | undefined;
	let timer: NodeJS.Timeout | undefined;
	let removeAbortListener: (() => void) | undefined;
	let terminalReason: "timeout" | "cancelled" | undefined;
	const terminal = new Promise<never>((_resolve, reject) => {
		timer = setTimeout(() => {
			terminalReason = "timeout";
			reject(new Error(`${input.responseLabel} session timed out.`));
			void abortSession(session);
		}, input.route.timeoutMs);
		if (input.signal) {
			const cancel = (): void => {
				terminalReason = "cancelled";
				reject(new Error(`${input.responseLabel} session was cancelled.`));
				void abortSession(session);
			};
			input.signal.addEventListener("abort", cancel, {once: true});
			removeAbortListener = () =>
				input.signal?.removeEventListener("abort", cancel);
		}
	});
	try {
		const sessionPromise = input.sessionFactory({
			repoRoot: input.repoRoot,
			route: input.route,
			systemPrompt: input.systemPrompt,
			responseLimit: input.responseLimit,
			responseLabel: input.responseLabel,
		});
		void sessionPromise.then(
			(lateSession) => {
				if (terminalReason && lateSession !== session) {
					void disposeSession(lateSession);
				}
			},
			() => undefined,
		);
		session = await Promise.race([sessionPromise, terminal]);
		await Promise.race([session.prompt(input.invocationPrompt), terminal]);
		return Object.freeze({
			status: "completed",
			response: boundedResponse(session.readResponse(), input.responseLimit),
		});
	} catch (error) {
		if (terminalReason) return Object.freeze({status: terminalReason});
		if (error instanceof PiMalformedModelResponseError) {
			return Object.freeze({status: "malformed_output"});
		}
		if (error instanceof PiModelUnavailableError) {
			return Object.freeze({status: "unavailable"});
		}
		return Object.freeze({status: "provider_failure"});
	} finally {
		if (timer) clearTimeout(timer);
		removeAbortListener?.();
		if (session) await disposeSession(session);
	}
}

function assertSessionInput(input: {
	readonly route: PiIsolatedJsonModelRoute;
	readonly systemPrompt: string;
	readonly invocationPrompt: string;
	readonly responseLimit: number;
	readonly responseLabel: string;
}): void {
	if (
		!Number.isSafeInteger(input.route.timeoutMs) ||
		input.route.timeoutMs < 1 ||
		input.route.timeoutMs > 3_600_000
	) {
		throw new Error("Pi isolated model session timeout is invalid.");
	}
	if (
		!Number.isSafeInteger(input.responseLimit) ||
		input.responseLimit < 1 ||
		input.responseLimit > 1_048_576
	) {
		throw new Error("Pi isolated model session response limit is invalid.");
	}
	if (
		!input.systemPrompt.trim() ||
		!input.invocationPrompt.trim() ||
		!input.responseLabel.trim()
	) {
		throw new Error("Pi isolated model session prompts and label are required.");
	}
}

export function createDefaultPiIsolatedJsonModelSessionFactory(
	options: PiIsolatedJsonModelSdkOptions,
): PiIsolatedJsonModelSessionFactory {
	return async (input) => {
		const {piSdk, agentDir, modelRuntime, model} = await loadPiModel(
			options,
			input,
		);
		const settingsManager = piSdk.SettingsManager.inMemory({
			compaction: {enabled: false},
			retry: {enabled: false},
		});
		const resourceLoader: ResourceLoader = {
			getExtensions: () => ({
				extensions: [],
				errors: [],
				runtime: piSdk.createExtensionRuntime(),
			}),
			getSkills: () => ({skills: [], diagnostics: []}),
			getPrompts: () => ({prompts: [], diagnostics: []}),
			getThemes: () => ({themes: [], diagnostics: []}),
			getAgentsFiles: () => ({agentsFiles: []}),
			getSystemPrompt: () => input.systemPrompt,
			getAppendSystemPrompt: () => [],
			extendResources: () => {},
			reload: async () => {},
		};
		const createAgentSession = options.createAgentSession || piSdk.createAgentSession;
		const {session} = await createAgentSession({
			cwd: input.repoRoot,
			agentDir,
			modelRuntime,
			model,
			thinkingLevel: input.route.thinking,
			noTools: "all",
			tools: [],
			customTools: [],
			resourceLoader,
			sessionManager: piSdk.SessionManager.inMemory(input.repoRoot),
			settingsManager,
		});
		let responseText = "";
		let responseOverflow = false;
		const unsubscribe = session.subscribe((event) => {
			if (
				event.type !== "message_update" ||
				event.assistantMessageEvent.type !== "text_delta"
			) {
				return;
			}
			responseText += event.assistantMessageEvent.delta;
			if (Buffer.byteLength(responseText, "utf8") > input.responseLimit) {
				responseOverflow = true;
				void Promise.resolve()
					.then(() => session.abort())
					.catch(() => undefined);
			}
		});
		return {
			prompt: async (prompt) => {
				try {
					await session.prompt(prompt);
				} catch (error) {
					if (responseOverflow) throw responseLimitError(input);
					throw error;
				}
			},
			readResponse: () => {
				if (responseOverflow) throw responseLimitError(input);
				return parseResponseText(responseText, input);
			},
			abort: () => session.abort(),
			dispose: () => {
				unsubscribe();
				return session.dispose();
			},
		};
	};
}

async function loadPiModel(
	options: PiIsolatedJsonModelSdkOptions,
	input: PiIsolatedJsonModelSessionFactoryInput,
): Promise<LoadedPiModel> {
	assertPiSdkNodeVersion();
	const piSdk = options.piSdk || (await import("@earendil-works/pi-coding-agent"));
	const agentDir = options.agentDir || piSdk.getAgentDir();
	const modelRuntime =
		options.modelRuntime ||
		(await piSdk.ModelRuntime.create({
			authPath: join(agentDir, "auth.json"),
			modelsPath: join(agentDir, "models.json"),
		}));
	const model = modelRuntime.getModel(input.route.provider, input.route.model);
	if (!model) {
		throw new PiModelUnavailableError(
			`Configured model ${input.route.provider}/${input.route.model} is unavailable.`,
		);
	}
	return {piSdk, agentDir, modelRuntime, model};
}

export function requiredPiModelRepoRoot(value: string): string {
	const normalized = value.trim();
	if (!normalized) throw new Error("Pi isolated model session requires repoRoot.");
	return normalized;
}

function boundedResponse(value: unknown, limit: number): unknown {
	try {
		const json = JSON.stringify(value);
		if (json === undefined || Buffer.byteLength(json, "utf8") > limit) {
			throw new PiMalformedModelResponseError("Model response is not bounded JSON.");
		}
		return JSON.parse(json) as unknown;
	} catch (error) {
		if (error instanceof PiMalformedModelResponseError) throw error;
		throw new PiMalformedModelResponseError("Model response is not bounded JSON.");
	}
}

function parseResponseText(
	value: string,
	input: Pick<
		PiIsolatedJsonModelSessionFactoryInput,
		"responseLimit" | "responseLabel"
	>,
): unknown {
	if (Buffer.byteLength(value, "utf8") > input.responseLimit) {
		throw responseLimitError(input);
	}
	try {
		return JSON.parse(value) as unknown;
	} catch {
		throw new PiMalformedModelResponseError(
			`${input.responseLabel} response is not valid JSON.`,
		);
	}
}

function responseLimitError(
	input: Pick<
		PiIsolatedJsonModelSessionFactoryInput,
		"responseLimit" | "responseLabel"
	>,
): PiMalformedModelResponseError {
	return new PiMalformedModelResponseError(
		`${input.responseLabel} response exceeds ${input.responseLimit} bytes.`,
	);
}

async function abortSession(
	session: PiIsolatedJsonModelSession | undefined,
): Promise<void> {
	try {
		await session?.abort?.();
	} catch {
		// Best effort after cancellation or timeout.
	}
}

async function disposeSession(session: PiIsolatedJsonModelSession): Promise<void> {
	try {
		await session.dispose();
	} catch {
		// Cleanup cannot change an already observed model outcome.
	}
}

function assertPiSdkNodeVersion(): void {
	const major = Number.parseInt(process.versions.node.split(".")[0] || "0", 10);
	if (major < 20) {
		throw new Error("Pi isolated model session requires Node.js 20 or newer.");
	}
}

class PiModelUnavailableError extends Error {}
class PiMalformedModelResponseError extends Error {}
