import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
	cpSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { pathToFileURL } from "node:url";
import { verifySelfDogfoodBaselineArtifact } from "../src/project/self-dogfood-baseline.ts";

function manifestOption() {
	const index = process.argv.indexOf("--manifest");
	const value =
		index >= 0
			? process.argv[index + 1]
			: process.env.CODEWIKI_BASELINE_MANIFEST;
	if (!value) {
		throw new Error(
			"Pass --manifest or set CODEWIKI_BASELINE_MANIFEST to a pinned baseline manifest.",
		);
	}
	return value;
}

function run(command, args, options = {}) {
	const result = spawnSync(command, args, {
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
		...options,
	});
	assert.equal(
		result.status,
		0,
		`${command} ${args.join(" ")} failed\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
	);
	return result;
}

function filesUnder(root) {
	if (!existsSync(root)) return [];
	return readdirSync(root)
		.sort()
		.flatMap((name) => {
			const path = join(root, name);
			return statSync(path).isDirectory() ? filesUnder(path) : [path];
		});
}

function repoTruthDigest(repoRoot) {
	const paths = [join(repoRoot, ".codewiki", "config.json")].filter(existsSync);
	paths.push(...filesUnder(join(repoRoot, ".codewiki", "traces")));
	const hash = createHash("sha256");
	for (const path of paths) {
		hash.update(path.slice(repoRoot.length));
		hash.update("\0");
		hash.update(readFileSync(path));
		hash.update("\0");
	}
	return hash.digest("hex");
}

function mockPi() {
	const tools = [];
	return {
		tools,
		api: {
			registerTool(tool) {
				tools.push(tool);
			},
			registerCommand() {},
			on() {},
		},
	};
}

function toolByName(pi, name) {
	const tool = pi.tools.find((candidate) => candidate.name === name);
	assert.ok(tool, `Pinned baseline did not register ${name}.`);
	return tool;
}

function toolResult(result, name) {
	assert.ok(
		result?.details?.result,
		`${name} did not return structured details.`,
	);
	return result.details.result;
}

function shadowChange(createdAt) {
	return {
		schemaVersion: 1,
		id: "CHG-self-dogfood-shadow",
		revision: 1,
		status: "pending",
		intent: {
			question: "Can the pinned baseline preview an accepted Change safely?",
			currentState:
				"Package gates alone do not prove accepted-only Decision preview behavior against repository state.",
			desiredState:
				"A disposable copy receives deterministic read-only and accepted-Change preview results from the pinned package.",
			rationale:
				"Shadow evidence must precede any supervised repo-local mutation.",
			nonGoals: [
				"Do not append repository traces.",
				"Do not grant Decision approval through the shadow runner.",
			],
		},
		classification: {
			kind: "harden",
			type: "workflow_change",
			scope: "system",
			affectedLayers: ["changes", "decision", "runtime"],
			targetRefs: ["scripts/run-self-dogfood-shadow.mjs"],
		},
		impact: {
			user: "Reduces risk before supervised self-dogfood activation.",
			maintainer:
				"Adds reproducible evidence tied to one reviewed package digest.",
		},
		evidence: {
			sourceRefs: ["kb:system/components/runtime.md"],
			proofRefs: ["scripts/run-self-dogfood-shadow.mjs"],
		},
		safety: {
			risk: "low",
			safetyBoundary:
				"All CodeWiki execution targets a temporary copy; source trace bytes are checked before and after.",
			failureModes: [
				"Baseline package integrity differs from the reviewed manifest.",
				"Read or preview unexpectedly mutates source truth.",
			],
			negativeTestPlan:
				"Reject altered package bytes and compare source truth digests around shadow execution.",
			rollbackPlan: "Delete the disposable shadow repository.",
		},
		validation: {
			state: "draft",
			issues: [],
			assessments: [],
			recommendations: [],
			successSignal:
				"State and preview calls complete while source config and traces retain the same digest.",
			regressionPlan: "Run the pinned-controller shadow gate.",
		},
		estimates: {
			effort: "low",
			workScale: "small",
		},
		provenance: {
			origin: "agent",
			createdBy: "self-dogfood-shadow",
			createdAt,
			updatedAt: createdAt,
		},
	};
}

async function seedAcceptedChange(packageRoot, shadowRoot, createdAt) {
	const [
		{ changeContentDigest },
		{ GitRefChangeStore },
		{ createChangeRecord },
	] = await Promise.all([
		import(
			pathToFileURL(join(packageRoot, "dist", "changes", "digest.js")).href
		),
		import(
			pathToFileURL(join(packageRoot, "dist", "changes", "git-ref-store.js"))
				.href
		),
		import(
			pathToFileURL(join(packageRoot, "dist", "changes", "records.js")).href
		),
	]);
	run("git", ["init", "-q"], { cwd: shadowRoot });
	const change = shadowChange(createdAt);
	change.validation = {
		...change.validation,
		state: "valid",
		validatedRevision: change.revision,
		validatedDigest: changeContentDigest(change),
		validatorVersion: "self-dogfood-shadow.v1",
	};
	const record = createChangeRecord(change);
	const store = new GitRefChangeStore({ repoRoot: shadowRoot });
	const seeded = await store.write({
		expectedHead: null,
		records: [record],
		message: `Seed ${change.id}`,
		actor: "self-dogfood-shadow",
		createdAt,
	});
	return {
		expectedHead: seeded.head,
		selections: [
			{
				changeId: change.id,
				revision: change.revision,
				recordRevision: record.recordRevision,
				contentDigest: changeContentDigest(change),
			},
		],
		acceptedBy: "self-dogfood-shadow",
		acceptedAt: createdAt,
	};
}

const repoRoot = process.cwd();
const sourceDigestBefore = repoTruthDigest(repoRoot);
const verified = await verifySelfDogfoodBaselineArtifact(manifestOption());
const temporaryRoot = mkdtempSync(
	join(tmpdir(), "codewiki-self-dogfood-shadow-"),
);
let evidence;
let shadowError;
try {
	const shadowRoot = join(temporaryRoot, "project");
	mkdirSync(join(shadowRoot, ".codewiki"), { recursive: true });
	for (const name of ["config.json", "kb", "traces", "views"]) {
		const source = join(repoRoot, ".codewiki", name);
		if (existsSync(source)) {
			cpSync(source, join(shadowRoot, ".codewiki", name), { recursive: true });
		}
	}
	if (existsSync(join(repoRoot, "README.md"))) {
		cpSync(join(repoRoot, "README.md"), join(shadowRoot, "README.md"));
	}
	writeFileSync(
		join(shadowRoot, "package.json"),
		`${JSON.stringify({ name: "codewiki-self-dogfood-shadow", private: true, type: "module" }, null, "\t")}\n`,
	);

	const piNpmRoot = join(shadowRoot, ".pi", "npm");
	mkdirSync(piNpmRoot, { recursive: true });
	run(
		"npm",
		[
			"install",
			"--ignore-scripts",
			"--no-audit",
			"--no-fund",
			"--prefix",
			piNpmRoot,
			verified.packagePath,
		],
		{ cwd: shadowRoot },
	);
	const packageRoot = join(
		piNpmRoot,
		"node_modules",
		"@nunomoura",
		"codewiki",
	);
	const packageJson = JSON.parse(
		readFileSync(join(packageRoot, "package.json"), "utf8"),
	);
	assert.equal(packageJson.name, verified.manifest.package.name);
	assert.equal(packageJson.version, verified.manifest.package.version);

	const extension = await import(
		pathToFileURL(join(packageRoot, "dist", "pi", "extension.js")).href
	);
	const pi = mockPi();
	extension.default(pi.api);
	const ctx = { cwd: shadowRoot, ui: { notify() {} } };
	const state = toolResult(
		await toolByName(pi, "wiki_state").execute(
			"shadow-state",
			{},
			undefined,
			undefined,
			ctx,
		),
		"wiki_state",
	);
	const config = toolResult(
		await toolByName(pi, "wiki_config").execute(
			"shadow-config",
			{ input: {}, write: false },
			undefined,
			undefined,
			ctx,
		),
		"wiki_config",
	);

	const traceId = "TRACE-self-dogfood-shadow";
	const createdAt = new Date().toISOString();
	const changeAcceptance = await seedAcceptedChange(
		packageRoot,
		shadowRoot,
		createdAt,
	);
	const sprintBoundary = {
		accountableGoal:
			"Prove the reviewed package can run a safe shadow Decision.",
		knowledgeTopics: [".codewiki/kb/system/components/extension.md"],
		dependencies: [],
		rollbackBoundary: "Discard the disposable shadow repository.",
		assessment: {
			stance: "coherent",
			rationale:
				"One accepted shadow Change serves one package verification goal.",
		},
	};
	const tracePath = join(shadowRoot, ".codewiki", "traces", `${traceId}.jsonl`);
	mkdirSync(join(shadowRoot, ".codewiki", "traces"), { recursive: true });
	const traceHead = `${JSON.stringify({
		type: "trace_head",
		traceId,
		title: "Self-dogfood baseline shadow",
		createdAt,
	})}\n`;
	writeFileSync(tracePath, traceHead);
	const preview = toolResult(
		await toolByName(pi, "wiki_decide").execute(
			"shadow-preview",
			{
				input: {
					traceId,
					mode: "preview",
					changeAcceptance,
					sprintBoundary,
				},
			},
			undefined,
			undefined,
			ctx,
		),
		"wiki_decide",
	);
	assert.equal(preview.mode, "preview");
	assert.equal(readFileSync(tracePath, "utf8"), traceHead);

	evidence = {
		ok: true,
		mode: "shadow",
		baselineCommit: verified.manifest.source.commit,
		baselineSha256: verified.manifest.package.sha256,
		package: `${packageJson.name}@${packageJson.version}`,
		stateTraceCount: state.traceIds.length,
		configProject: config.config.project,
		previewMode: preview.mode,
		previewEvent: preview.iterationEvent.event,
		previewTrace: traceId,
		sourceTruthSha256: sourceDigestBefore,
		shadowRoot: basename(shadowRoot),
	};
} catch (error) {
	shadowError = error;
} finally {
	rmSync(temporaryRoot, { recursive: true, force: true });
}

const sourceDigestAfter = repoTruthDigest(repoRoot);
assert.equal(
	sourceDigestAfter,
	sourceDigestBefore,
	"Shadow execution changed source .codewiki config or trace truth.",
);
if (shadowError) throw shadowError;
assert.ok(evidence, "Shadow execution produced no evidence.");
console.log(JSON.stringify(evidence, null, 2));
