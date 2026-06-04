import "../setup-env.mjs";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	appendCodewikiSystemPromptContract,
	buildCodewikiSystemPromptContract,
	CODEWIKI_SYSTEM_CONTRACT_MARKER,
	installCodewikiPromptContract,
} from "../../src/adapters/pi/prompt-contract.ts";

assert.match(buildCodewikiSystemPromptContract(), /wiki_state/);
assert.match(buildCodewikiSystemPromptContract(), /wiki_decide/);
assert.match(buildCodewikiSystemPromptContract(), /wiki_runtime/);
assert.match(
	buildCodewikiSystemPromptContract(),
	/decision -> planning -> implementation, with gateway pass\/fail\/block evidence/,
);
assert.doesNotMatch(
	buildCodewikiSystemPromptContract(),
	/decision -> planning -> implementation -> validation/,
);
assert.match(
	buildCodewikiSystemPromptContract(),
	/Do not hand-edit generated views/,
);

const once = appendCodewikiSystemPromptContract("BASE");
const twice = appendCodewikiSystemPromptContract(once);
assert.equal(twice, once, "prompt contract appending should be idempotent");

const root = await mkdtemp(join(tmpdir(), "codewiki-prompt-contract-"));
try {
	const handlers = new Map();
	installCodewikiPromptContract({
		on(name, handler) {
			handlers.set(name, handler);
		},
	});
	assert.ok(handlers.has("before_agent_start"));
	const handler = handlers.get("before_agent_start");
	const withoutProject = await handler(
		{ systemPrompt: "BASE", systemPromptOptions: { cwd: root } },
		{ cwd: root, ui: { notify() {} } },
	);
	assert.equal(
		withoutProject,
		undefined,
		"prompt contract should not inject outside CodeWiki projects",
	);

	await mkdir(join(root, ".codewiki"), { recursive: true });
	await writeFile(
		join(root, ".codewiki/config.json"),
		JSON.stringify(
			{
				project_name: "prompt-contract-smoke",
				schema_version: 4,
				docs_root: ".codewiki/kb",
			},
			null,
			2,
		),
	);
	const injected = await handler(
		{ systemPrompt: "BASE", systemPromptOptions: { cwd: root } },
		{ cwd: root, ui: { notify() {} } },
	);
	assert.match(injected.systemPrompt, /prompt-contract-smoke/);
	assert.match(
		injected.systemPrompt,
		new RegExp(CODEWIKI_SYSTEM_CONTRACT_MARKER),
	);
	assert.match(injected.systemPrompt, /\.codewiki\/kb\/\*\*/);
	assert.match(injected.systemPrompt, /wiki_runtime/);
} finally {
	await rm(root, { recursive: true, force: true });
}

console.log("✓ prompt contract smoke passed");
