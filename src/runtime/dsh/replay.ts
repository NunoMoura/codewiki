import {readFileSync} from "node:fs";
import {isAbsolute} from "node:path";

import {installLlmReplay} from "@deepseek-ai/dsh-llm-replay";

import type {DshModelAdapterInstaller} from "./adapter.ts";
import {
	assertSha256Digest,
	sha256Digest,
	type Sha256Digest,
} from "../../utils/canonical-json.ts";

interface DshReplayModelOptions {
	readonly fixturePath: string;
	readonly fixtureDigest: Sha256Digest;
}

export function createDshReplayModelInstaller(
	options: DshReplayModelOptions,
): DshModelAdapterInstaller {
	if (!options || typeof options.fixturePath !== "string" || !isAbsolute(options.fixturePath)) {
		throw new Error("DSH replay fixture path must be absolute.");
	}
	const fixtureDigest = assertSha256Digest(
		options.fixtureDigest,
		"DSH replay fixture digest",
	);
	const fixture = readFileSync(options.fixturePath);
	if (sha256Digest(fixture) !== fixtureDigest) {
		throw new Error("DSH replay fixture does not match its bound digest.");
	}
	return ({context, request}) => {
		const replay = installLlmReplay(context, {
			file: options.fixturePath,
			providers: [
				{
					id: request.inputs.modelRoute.provider,
					models: [{id: request.inputs.modelRoute.model}],
				},
			],
		});
		return Object.freeze({
			assertComplete: () => replay.assertConsumed(),
			dispose: () => replay.dispose(),
		});
	};
}
