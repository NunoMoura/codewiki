#!/usr/bin/env node
import "../setup-env.mjs";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
	appendFileSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path, { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, "..", "..");
const packageJsonPath = resolve(repoRoot, "package.json");
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
const require = createRequire(import.meta.url);
const PI_CODING_AGENT_PACKAGE = "@earendil-works/pi-coding-agent";
const agentDir = resolve(
	process.env.HOME ?? resolve(repoRoot, ".."),
	".pi",
	"agent",
);

function findPiRoot() {
	const fromEnv = process.env.PI_CODING_AGENT_ROOT;
	const candidates = [
		fromEnv,
		resolve(repoRoot, "node_modules", "@earendil-works", "pi-coding-agent"),
	].filter(Boolean);

	for (const candidate of candidates) {
		if (candidate && existsSync(resolve(candidate, "dist", "index.js")))
			return candidate;
	}

	try {
		const globalRoot = execFileSync("npm", ["root", "-g"], {
			encoding: "utf8",
		}).trim();
		const candidate = resolve(globalRoot, "@earendil-works", "pi-coding-agent");
		if (existsSync(resolve(candidate, "dist", "index.js"))) return candidate;
	} catch {
		// Ignore and fall through to the final error.
	}

	throw new Error(
		`Unable to locate ${PI_CODING_AGENT_PACKAGE}. Set PI_CODING_AGENT_ROOT or install pi-coding-agent locally/globally before running the smoke tests.`,
	);
}

function extendNodePath(piRoot) {
	const entries = [
		resolve(repoRoot, "node_modules"),
		resolve(piRoot, "node_modules"),
		resolve(piRoot, "..", ".."),
	].filter(existsSync);

	const existing =
		process.env.NODE_PATH?.split(path.delimiter).filter(Boolean) ?? [];
	process.env.NODE_PATH = [...new Set([...entries, ...existing])].join(
		path.delimiter,
	);
	require("node:module").Module._initPaths();
}

function withTempDir(prefix, fn) {
	const dir = mkdtempSync(path.join(tmpdir(), prefix));
	const run = async () => fn(dir);
	return run().finally(() => {
		rmSync(dir, { recursive: true, force: true });
	});
}

function ensureIncludes(actual, expected, label) {
	for (const item of expected) {
		assert.ok(
			actual.includes(item),
			`${label} missing ${item}. Got: ${actual.join(", ")}`,
		);
	}
}

async function main() {
	const piRoot = findPiRoot();
	extendNodePath(piRoot);
	const { DefaultResourceLoader, initTheme } = await import(
		pathToFileURL(resolve(piRoot, "dist", "index.js")).href
	);
	initTheme("dark", false);
	process.env.PI_CODEWIKI_SKIP_VERIFIER = "1";
	const roadmapSource = readFileSync(resolve(repoRoot, "src", "roadmap", "runtime.ts"), "utf8");
	const taskAdapterSource = readFileSync(resolve(repoRoot, "src", "adapters", "pi", "tools", "task.ts"), "utf8");
	assert.match(roadmapSource, /TaskVerifierProfile = "task-close"/, "Verifier gateway should define task-close profile contract");
	assert.match(roadmapSource, /runTaskClosePreflight/, "Verifier gateway should run deterministic task-close preflight");
	assert.match(roadmapSource, /Malformed verifier JSON output/, "Malformed verifier output should block closure");
	assert.match(roadmapSource, /strict JSON matching verdict_schema/, "Verifier gateway should require strict JSON without surrounding diagnostics");
	assert.match(roadmapSource, /compactVerifierContext/, "Verifier gateway should compact context packs before semantic verification");
	assert.match(roadmapSource, /SemanticTaskVerifierRunner/, "Verifier gateway should depend on an adapter-provided semantic verifier runner");
	assert.doesNotMatch(roadmapSource, /execFileAsync\(\s*"pi"/, "Verifier gateway should not spawn the Pi CLI directly");
	assert.doesNotMatch(taskAdapterSource, /createAgentSession/, "Pi task adapter should not run semantic verification from the close path");
	assert.doesNotMatch(taskAdapterSource, /SessionManager\.inMemory/, "Pi task adapter should not create verifier sessions during task mutation");
	assert.doesNotMatch(taskAdapterSource, /runSemanticVerifier/, "TaskMutationPorts should not carry deprecated verifier runners");
	assert.match(roadmapSource, /\["pass", "fail", "block"\]/, "Verifier gateway should cover pass/fail/block verdicts");

	const verifierParserStart = roadmapSource.indexOf("function taskVerifierBlock");
	const verifierParserEnd = roadmapSource.indexOf("/**\n * Run the automatic task verifier", verifierParserStart);
	assert.ok(verifierParserStart >= 0 && verifierParserEnd > verifierParserStart, "Verifier parser source block should be discoverable for golden tests");
	const verifierParserTs = [
		"type TaskVerifierResult = any;",
		roadmapSource.slice(verifierParserStart, verifierParserEnd),
		"export { extractVerifierJson };",
	].join("\n");
	const ts = require("typescript");
	const verifierParserJs = ts.transpileModule(verifierParserTs, {
		compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
	}).outputText;
	const verifierSmokeDir = mkdtempSync(resolve(tmpdir(), "codewiki-verifier-parser-"));
	const verifierSmokeModule = resolve(verifierSmokeDir, "parser.mjs");
	writeFileSync(verifierSmokeModule, verifierParserJs, "utf8");
	try {
		const { extractVerifierJson } = await import(pathToFileURL(verifierSmokeModule).href);
		const passVerdict = extractVerifierJson('{"verdict":"pass","taskId":"TASK-999","checks":["npm test"],"issues":[],"rationale":"ok"}', "TASK-999");
		assert.equal(passVerdict.verdict, "pass", "Verifier parser should preserve pass verdicts");
		const failVerdict = extractVerifierJson('{"verdict":"fail","taskId":"TASK-999","checks":["npm test"],"issues":[{"severity":"high","summary":"gap"}],"rationale":"gap remains"}', "TASK-999");
		assert.equal(failVerdict.verdict, "fail", "Verifier parser should preserve fail verdicts");
		assert.equal(failVerdict.issues[0].severity, "high", "Verifier parser should preserve issue severity");
		const blockVerdict = extractVerifierJson('{"verdict":"block","taskId":"TASK-999","checks":["manual"],"issues":[{"severity":"medium","summary":"ambiguous"}],"rationale":"blocked"}', "TASK-999");
		assert.equal(blockVerdict.verdict, "block", "Verifier parser should preserve strict block verdicts");
		const diagnosticVerdict = extractVerifierJson('diagnostic before {"verdict":"pass","taskId":"TASK-999","checks":[],"issues":[],"rationale":"ok"}', "TASK-999");
		assert.equal(diagnosticVerdict.verdict, "block", "Verifier parser should block surrounding diagnostics in strict JSON mode");
		const malformedVerdict = extractVerifierJson("not json", "TASK-999");
		assert.equal(malformedVerdict.verdict, "block", "Malformed verifier output should become a block verdict");
		assert.match(malformedVerdict.rationale, /Failed to parse verifier output/, "Malformed verifier output should explain parse failure");
		const mismatchVerdict = extractVerifierJson('{"verdict":"pass","taskId":"TASK-OTHER","checks":[],"issues":[],"rationale":"wrong task"}', "TASK-999");
		assert.equal(mismatchVerdict.verdict, "block", "Verifier parser should block task id mismatches");
		const permissiveIssueVerdict = extractVerifierJson('{"verdict":"fail","taskId":"TASK-999","checks":["npm test"],"issues":[{"summary":"missing severity"}],"rationale":"gap"}', "TASK-999");
		assert.equal(permissiveIssueVerdict.verdict, "block", "Verifier parser should block malformed issue schema instead of coercing it");
		const extraFieldVerdict = extractVerifierJson('{"verdict":"pass","taskId":"TASK-999","checks":[],"issues":[],"rationale":"ok","extra":true}', "TASK-999");
		assert.equal(extraFieldVerdict.verdict, "block", "Verifier parser should block extra fields under strict schema validation");
		const extraIssueFieldVerdict = extractVerifierJson('{"verdict":"fail","taskId":"TASK-999","checks":["npm test"],"issues":[{"severity":"high","summary":"gap","extra":"nope"}],"rationale":"gap"}', "TASK-999");
		assert.equal(extraIssueFieldVerdict.verdict, "block", "Verifier parser should block extra issue fields under strict nested schema validation");
	} finally {
		rmSync(verifierSmokeDir, { recursive: true, force: true });
	}

	assert.equal(packageJson.name, "codewiki", "Unexpected package name");
	assert.ok(
		Array.isArray(packageJson.pi?.extensions) &&
			packageJson.pi.extensions.length === 1,
		"Expected one Pi extension in package.json",
	);
	assert.ok(
		Array.isArray(packageJson.pi?.skills) && packageJson.pi.skills.length === 1,
		"Expected one Pi skill path in package.json",
	);
	assert.equal(
		packageJson.peerDependencies?.[PI_CODING_AGENT_PACKAGE],
		"*",
		"Missing pi-coding-agent peer dependency",
	);
	assert.equal(
		packageJson.peerDependencies?.["@sinclair/typebox"],
		"*",
		"Missing @sinclair/typebox peer dependency",
	);
	console.log(
		`✓ package manifest looks correct (${packageJson.name}@${packageJson.version})`,
	);

	await withTempDir("codewiki-loader-", async (projectDir) => {
		mkdirSync(resolve(projectDir, ".pi"), { recursive: true });
		writeFileSync(
			resolve(projectDir, ".pi", "settings.json"),
			JSON.stringify({ packages: [repoRoot] }, null, 2),
		);

		const loader = new DefaultResourceLoader({ cwd: projectDir, agentDir });
		await loader.reload();

		const extensionResult = loader.getExtensions();
		assert.equal(
			extensionResult.errors.length,
			0,
			`Unexpected extension load errors: ${extensionResult.errors.map((e) => e.message).join(" | ")}`,
		);

		const extensions = extensionResult.extensions.filter((extension) =>
			extension.path.startsWith(repoRoot),
		);
		assert.equal(
			extensions.length,
			1,
			`Expected exactly one package extension, found ${extensions.length}`,
		);
		const extension = extensions[0];
		assert.equal(
			extension.sourceInfo.origin,
			"package",
			"Extension should load as a package resource",
		);
		assert.equal(
			extension.sourceInfo.scope,
			"project",
			"Extension should load from project package settings",
		);
		const commandNames = [...extension.commands.keys()];
		ensureIncludes(
			commandNames,
			["audit", "wiki-bootstrap", "wiki-config", "wiki-status", "wiki-ui", "wiki-resume"],
			"extension commands",
		);
		assert.equal(
			commandNames.length,
			6,
			`Expected exactly 6 public commands, got ${commandNames.length}: ${commandNames.join(", ")}`,
		);
		for (const legacyCommand of [
			"wiki-fix",
			"wiki-review",
			"wiki-code",
			"wiki-setup",
			"wiki-rebuild",
			"wiki-lint",
			"wiki-roadmap",
			"wiki-self-drift",
			"wiki-code-drift",
			"wiki-task",
			"wiki-session-handoff",
		]) {
			assert.ok(
				!commandNames.includes(legacyCommand),
				`Legacy public command should not be registered: ${legacyCommand}`,
			);
		}
		assert.ok(
			extension.shortcuts.has("alt+w"),
			"Expected alt+w shortcut for toggling the status panel",
		);
		const extensionToolNames = [...extension.tools.keys()];
		ensureIncludes(
			extensionToolNames,
			[
				"codewiki_setup",
				"codewiki_bootstrap",
				"codewiki_state",
				"codewiki_resume_context",
				"codewiki_artifact_status",
				"codewiki_audit",
				"codewiki_build",
				"codewiki_validation",
				"codewiki_gc",
				"codewiki_task",
				"codewiki_diff_table",
				"codewiki_session",
				"codewiki_agency",
			],
			"extension tools",
		);
		const skillToolCatalog = readFileSync(resolve(repoRoot, "skills", "codewiki", "references", "tool-catalog.md"), "utf8");
		for (const toolName of extensionToolNames.filter((name) => name.startsWith("codewiki_"))) {
			assert.match(skillToolCatalog, new RegExp(`\\\`${toolName}\\\``), `Skill-facing tool catalog missing ${toolName}`);
		}
		assert.match(skillToolCatalog, /action="sprint"/, "Skill-facing tool catalog should document safe sprint metadata path");
		const piIndexSource = readFileSync(resolve(repoRoot, "src", "adapters", "pi", "index.ts"), "utf8");
		const bootstrapSource = readFileSync(resolve(repoRoot, "src", "adapters", "pi", "bootstrap.ts"), "utf8");
		assert.match(piIndexSource, /executeCodewikiBuildTool/, "Pi build registration should delegate to application tool executor");
		assert.match(piIndexSource, /executeCodewikiValidationTool/, "Pi validation registration should delegate to application tool executor");
		assert.match(piIndexSource, /executeCodewikiDiffTableTool/, "Pi diff-table registration should delegate to source-root tool executor");
		assert.match(piIndexSource, /api\/tools/, "Pi diff-table registration should delegate through the API facade");
		assert.match(piIndexSource, /executeCodewikiGcTool/, "Pi GC registration should delegate to source-root tool executor");
		assert.match(piIndexSource, /api\/tools/, "Pi GC registration should delegate through the API facade");
		assert.match(piIndexSource, /installCodewikiCompaction/, "Pi adapter should install CodeWiki-owned compaction soft refresh");
		assert.match(piIndexSource, /requestCodewikiContextRefresh/, "Loop-boundary tools should request CodeWiki context refresh");
		assert.match(bootstrapSource, /executeCodewikiSetupTool/, "Pi bootstrap setup tool should delegate through project tool contract");
		for (const removedAgencyShim of [
			"src/domain/agency/types.ts",
			"src/application/agency.ts",
			"src/application/tools/agency.ts",
		]) {
			assert.ok(!existsSync(resolve(repoRoot, removedAgencyShim)), `${removedAgencyShim} should not be packaged after agency cleanup`);
		}
		const agencyAdapterSource = readFileSync(resolve(repoRoot, "src", "adapters", "pi", "tools", "agency.ts"), "utf8");
		assert.match(agencyAdapterSource, /api\/tools/, "Pi agency tool should delegate through the API facade");
		assert.match(agencyAdapterSource, /agency\/types/, "Pi agency tool should read types from the agency source-root module");
		assert.doesNotMatch(agencyAdapterSource, /application\/tools\/agency|application\/agency|domain\/agency\/types/, "Pi agency tool should not delegate through old agency shims");
		for (const removedAuditShim of [
			"src/domain/audit/types.ts",
			"src/application/tools/audit.ts",
		]) {
			assert.ok(!existsSync(resolve(repoRoot, removedAuditShim)), `${removedAuditShim} should not be packaged after audit migration`);
		}
		const auditAdapterSource = readFileSync(resolve(repoRoot, "src", "adapters", "pi", "tools", "audit.ts"), "utf8");
		const auditCommandSource = readFileSync(resolve(repoRoot, "src", "adapters", "pi", "commands", "audit.ts"), "utf8");
		const schemaSource = readFileSync(resolve(repoRoot, "src", "adapters", "pi", "schemas.ts"), "utf8");
		const architectureScriptSource = readFileSync(resolve(repoRoot, "scripts", "check-architecture.mjs"), "utf8");
		assert.match(auditAdapterSource, /api\/tools/, "Pi audit tool should delegate through the API facade");
		assert.match(auditCommandSource, /api\/tools/, "Pi audit command should delegate through the API facade");
		assert.match(auditCommandSource, /audit\/types/, "Pi audit command should read types from the audit source-root module");
		assert.match(schemaSource, /audit\/types/, "Pi schemas should read audit values from the audit source-root module");
		assert.match(schemaSource, /change\/types/, "Pi schemas should read change values from the change source-root module");
		assert.match(architectureScriptSource, /src\/api\/tools\.ts/, "Architecture script should delegate through the API facade");
		for (const oldAuditPathSource of [auditAdapterSource, auditCommandSource, schemaSource, architectureScriptSource]) {
			assert.doesNotMatch(oldAuditPathSource, /application\/tools\/audit|domain\/audit\/types/, "Audit package paths should not delegate through old audit shims");
		}
		assert.doesNotMatch(piIndexSource, /application\/tools\/diff-table|application\/diff-table|domain\/change/, "Diff-table package paths should not delegate through old change/diff-table shims");
		assert.doesNotMatch(schemaSource, /domain\/change/, "Schema package paths should not read change values from old change shims");
		for (const removedGcShim of [
			"src/domain/gc/types.ts",
			"src/application/gc.ts",
			"src/application/tools/gc.ts",
		]) {
			assert.ok(!existsSync(resolve(repoRoot, removedGcShim)), `${removedGcShim} should not be packaged after GC migration`);
		}
		assert.match(schemaSource, /gc\/types/, "Pi schemas should read GC values from the GC source-root module");
		assert.doesNotMatch(piIndexSource, /application\/tools\/gc|application\/gc|domain\/gc/, "GC package paths should not delegate through old GC shims");
		assert.doesNotMatch(schemaSource, /domain\/gc/, "Schema package paths should not read GC values from old GC shims");
		for (const removedSessionShim of [
			"src/domain/session/types.ts",
			"src/domain/session/links.ts",
			"src/domain/session/worktree-isolation.ts",
			"src/domain/shared/session.ts",
			"src/application/session.ts",
			"src/application/claims.ts",
			"src/application/worktree-isolation.ts",
			"src/application/tools/session.ts",
			"src/application/tools/artifact-status.ts",
		]) {
			assert.ok(!existsSync(resolve(repoRoot, removedSessionShim)), `${removedSessionShim} should not be packaged after session migration`);
		}
		assert.match(schemaSource, /session\/types/, "Pi schemas should read session values from the session source-root module");
		assert.doesNotMatch(schemaSource, /domain\/session/, "Schema package paths should not read session values from old session shims");
		const artifactStatusAdapterSource = readFileSync(resolve(repoRoot, "src", "adapters", "pi", "tools", "artifact-status.ts"), "utf8");
		const sessionAdapterSource = readFileSync(resolve(repoRoot, "src", "adapters", "pi", "tools", "session.ts"), "utf8");
		assert.match(artifactStatusAdapterSource, /api\/tools/, "Pi artifact-status tool should delegate through the API facade");
		assert.match(artifactStatusAdapterSource, /session\/types/, "Pi artifact-status tool should read input types from the session source-root module");
		assert.match(sessionAdapterSource, /api\/tools/, "Pi session tool should delegate through the API facade");
		assert.match(sessionAdapterSource, /session\/types/, "Pi session tool should read input types from the session source-root module");
		assert.doesNotMatch(artifactStatusAdapterSource, /application\/tools\/artifact-status|application\/claims|domain\/session/, "Artifact-status package path should not delegate through old session/claims shims");
		assert.doesNotMatch(sessionAdapterSource, /application\/tools\/session|application\/session|domain\/session/, "Session package path should not delegate through old session shims");
		for (const removedRoadmapShim of [
			"src/domain/roadmap/types.ts",
			"src/domain/roadmap/status.ts",
			"src/domain/roadmap/task-id.ts",
			"src/domain/roadmap/task-boundary.ts",
			"src/application/roadmap.ts",
			"src/application/task.ts",
			"src/application/tools/task.ts",
		]) {
			assert.ok(!existsSync(resolve(repoRoot, removedRoadmapShim)), `${removedRoadmapShim} should not be packaged after roadmap migration`);
		}
		assert.match(schemaSource, /roadmap\/types/, "Pi schemas should read roadmap values from the roadmap source-root module");
		for (const removedStateOwner of [
			"src/domain/state/types.ts",
			"src/application/state.ts",
			"src/application/state-artifacts.ts",
			"src/application/state-builders.ts",
			"src/application/rebuild.ts",
			"src/application/graph.ts",
			"src/application/graph/rebuilder.ts",
			"src/application/lint.ts",
			"src/application/resume-context.ts",
			"src/application/prompt.ts",
			"src/application/skill-assets.ts",
			"src/application/local/rebuild-runner.ts",
			"src/application/local/status-dock-prefs.ts",
			"src/application/tools/state.ts",
			"src/application/tools/resume-context.ts",
		]) {
			assert.ok(!existsSync(resolve(repoRoot, removedStateOwner)), `${removedStateOwner} should not be packaged after state/graph/resume migration`);
		}
		const stateAdapterSource = readFileSync(resolve(repoRoot, "src", "adapters", "pi", "tools", "state.ts"), "utf8");
		const resumeContextAdapterSource = readFileSync(resolve(repoRoot, "src", "adapters", "pi", "tools", "resume-context.ts"), "utf8");
		const configCommandSource = readFileSync(resolve(repoRoot, "src", "adapters", "pi", "commands", "config.ts"), "utf8");
		const statusCommandSource = readFileSync(resolve(repoRoot, "src", "adapters", "pi", "commands", "status.ts"), "utf8");
		const resumeCommandSource = readFileSync(resolve(repoRoot, "src", "adapters", "pi", "commands", "resume.ts"), "utf8");
		const compactionSource = readFileSync(resolve(repoRoot, "src", "adapters", "pi", "compaction.ts"), "utf8");
		const uiManagerSource = readFileSync(resolve(repoRoot, "src", "adapters", "pi", "ui", "manager.ts"), "utf8");
		assert.match(stateAdapterSource, /api\/tools/, "Pi state tool should delegate through the API facade");
		assert.match(resumeContextAdapterSource, /api\/tools/, "Pi resume-context tool should delegate through the API facade");
		assert.match(schemaSource, /state\/types/, "Pi schemas should read state values from the state source-root module");
		assert.match(configCommandSource, /state\/local\/status-dock-prefs/, "Pi config command should read status dock prefs from state source root");
		assert.match(statusCommandSource, /state\/artifacts/, "Pi status command should read generated artifacts from state source root");
		assert.match(resumeCommandSource, /state\/resume-context/, "Pi resume command should build resume packets from state source root");
		assert.match(compactionSource, /state\/resume-context/, "Pi compaction should build resume packets from state source root");
		assert.match(uiManagerSource, /state\/artifacts/, "Pi status UI should read generated state artifacts from state source root");
		for (const statePathSource of [stateAdapterSource, resumeContextAdapterSource, schemaSource, configCommandSource, statusCommandSource, resumeCommandSource, compactionSource, uiManagerSource]) {
			assert.doesNotMatch(statePathSource, /domain\/state|application\/state|application\/graph|application\/rebuild|application\/lint|application\/resume-context|application\/prompt|application\/skill-assets|application\/local\/(?:rebuild-runner|status-dock-prefs)|application\/tools\/(?:state|resume-context)/, "State package paths should not delegate through old state/graph/resume shims");
		}
		const taskToolAdapterSource = readFileSync(resolve(repoRoot, "src", "adapters", "pi", "tools", "task.ts"), "utf8");
		assert.match(taskToolAdapterSource, /api\/tools/, "Pi task tool should delegate through the API facade");
		assert.doesNotMatch(taskToolAdapterSource, /application\/tools\/task|application\/task|domain\/roadmap/, "Pi task tool should not delegate through old roadmap/task shims");
		for (const removedTool of [
			"codewiki_rebuild",
			"codewiki_status",
			"codewiki_roadmap_append",
			"codewiki_roadmap_update",
			"codewiki_task_session_link",
			"codewiki_task_loop_update",
			"codewiki_session_handoff",
		]) {
			assert.ok(
				!extension.tools.has(removedTool),
				`Removed internal tool should not be registered: ${removedTool}`,
			);
		}

		const skillResult = loader.getSkills();
		assert.equal(
			skillResult.diagnostics.length,
			0,
			`Unexpected skill diagnostics: ${skillResult.diagnostics.map((d) => d.message).join(" | ")}`,
		);
		const skills = skillResult.skills.filter((skill) =>
			skill.filePath.startsWith(repoRoot),
		);
		const expectedSkillNames = ["codewiki", "codewiki-decision", "codewiki-implementation", "codewiki-planning", "codewiki-validation"];
		assert.deepEqual(
			skills.map((skill) => skill.name).sort(),
			expectedSkillNames,
			`Unexpected package skills: ${skills.map((skill) => skill.name).join(", ")}`,
		);
		for (const skill of skills) {
			assert.equal(
				skill.sourceInfo.origin,
				"package",
				"Skill should load as a package resource",
			);
		}
	});
	console.log(
		"✓ package loads through DefaultResourceLoader with one extension and CodeWiki skills",
	);

	await withTempDir("codewiki-bootstrap-", async (projectDir) => {
		mkdirSync(resolve(projectDir, ".pi"), { recursive: true });
		writeFileSync(
			resolve(projectDir, ".pi", "settings.json"),
			JSON.stringify({ packages: [repoRoot] }, null, 2),
		);
		process.env.PI_CODEWIKI_STATUS_PREFS_PATH = resolve(
			projectDir,
			".pi",
			"codewiki-status.json",
		);
		mkdirSync(resolve(projectDir, ".git"), { recursive: true });
		mkdirSync(resolve(projectDir, "frontend", "src"), { recursive: true });
		writeFileSync(
			resolve(projectDir, "frontend", "src", "index.ts"),
			"export const frontend = true;\n",
		);
		mkdirSync(resolve(projectDir, "backend"), { recursive: true });
		writeFileSync(resolve(projectDir, "backend", "app.py"), "app = object()\n");
		mkdirSync(resolve(projectDir, "packages", "sdk", "src"), {
			recursive: true,
		});
		writeFileSync(
			resolve(projectDir, "packages", "sdk", "package.json"),
			JSON.stringify({ name: "@smoke/sdk" }, null, 2),
		);
		const nestedDir = resolve(projectDir, "packages", "nested", "worktree");
		mkdirSync(nestedDir, { recursive: true });
		const outsideDir = dirname(projectDir);
		const blankDir = resolve(outsideDir, "blank-worktree");
		mkdirSync(blankDir, { recursive: true });

		const loader = new DefaultResourceLoader({ cwd: projectDir, agentDir });
		await loader.reload();
		const extension = loader
			.getExtensions()
			.extensions.find((item) => item.path.startsWith(repoRoot));
		assert.ok(
			extension,
			"Expected package extension to load for bootstrap smoke test",
		);

		const setupTool = extension.tools.get("codewiki_setup");
		assert.ok(
			setupTool && typeof setupTool.definition?.execute === "function",
			"Setup tool missing execute function",
		);
		const bootstrapTool = extension.tools.get("codewiki_bootstrap");
		assert.ok(
			bootstrapTool && typeof bootstrapTool.definition?.execute === "function",
			"Bootstrap tool missing execute function",
		);

		const firstResult = await setupTool.definition.execute(
			"setup-smoke-1",
			{ projectName: "Smoke Wiki" },
			undefined,
			undefined,
			{ cwd: nestedDir },
		);
		const secondResult = await bootstrapTool.definition.execute(
			"bootstrap-smoke-2",
			{ projectName: "Smoke Wiki", force: false },
			undefined,
			undefined,
			{ cwd: nestedDir },
		);
		const thirdResult = await setupTool.definition.execute(
			"setup-smoke-3",
			{ projectName: "Smoke Wiki", repoPath: projectDir },
			undefined,
			undefined,
			{ cwd: outsideDir },
		);
		const fourthResult = await bootstrapTool.definition.execute(
			"bootstrap-smoke-4",
			{ projectName: "Smoke Wiki", force: false, repoPath: projectDir },
			undefined,
			undefined,
			{ cwd: outsideDir },
		);

		const first = firstResult.details;
		const second = secondResult.details;
		const third = thirdResult.details;
		const fourth = fourthResult.details;
		assert.equal(
			first.root,
			projectDir,
			"Setup from nested cwd should target repo root when no wiki exists yet",
		);
		assert.equal(
			second.root,
			projectDir,
			"Bootstrap from nested cwd should reuse the existing wiki root",
		);
		assert.equal(
			third.root,
			projectDir,
			"Setup tool should accept explicit repoPath from outside cwd",
		);
		assert.equal(
			fourth.root,
			projectDir,
			"Bootstrap tool should accept explicit repoPath from outside cwd",
		);
		const sessionEntries = [];
		const toolCtx = {
			cwd: nestedDir,
			sessionManager: {
				getSessionId: () => "session-smoke-1",
				getSessionFile: () =>
					resolve(projectDir, ".pi", "sessions", "session-smoke-1.jsonl"),
				getSessionName: () => "Smoke session",
				getEntries: () => sessionEntries,
				getBranch: () => sessionEntries,
			},
			ui: {
				setStatus: () => {},
				setWidget: () => {},
				notify: () => {},
			},
		};
		const outsideToolCtx = {
			...toolCtx,
			cwd: outsideDir,
		};
		const stateTool = extension.tools.get("codewiki_state");
		assert.ok(
			stateTool && typeof stateTool.definition?.execute === "function",
			"State tool missing execute function",
		);
		const stateResult = await stateTool.definition.execute(
			"state-tool-smoke",
			{
				repoPath: projectDir,
				refresh: true,
				include: ["summary", "roadmap", "graph", "session"],
			},
			undefined,
			undefined,
			outsideToolCtx,
		);
		assert.equal(
			stateResult.details.repo.repo_root,
			projectDir,
			"State tool should accept explicit repoPath from outside cwd",
		);
		const nestedStateResult = await stateTool.definition.execute(
			"state-tool-nested-repo-path-smoke",
			{ repoPath: resolve(projectDir, "frontend", "src"), include: ["summary"] },
			undefined,
			undefined,
			outsideToolCtx,
		);
		assert.equal(
			nestedStateResult.details.repo.repo_root,
			projectDir,
			"State tool should climb from repoPath inside the target repo",
		);
		assert.match(
			stateResult.content[0]?.text ?? "",
			/open \d+; next/i,
			"State tool should return compact summary text",
		);
		const resumeContextTool = extension.tools.get("codewiki_resume_context");
		assert.ok(
			resumeContextTool && typeof resumeContextTool.definition?.execute === "function",
			"Resume context tool missing execute function",
		);
		const resumeContextResult = await resumeContextTool.definition.execute(
			"resume-context-tool-smoke",
			{ repoPath: projectDir, taskId: "TASK-001", refresh: true, followUpIntent: "keep context minimal" },
			undefined,
			undefined,
			outsideToolCtx,
		);
		assert.match(
			resumeContextResult.content[0]?.text ?? "",
			/Implement roadmap task TASK-001/i,
			"Resume context tool should return the bounded resume prompt to the agent",
		);
		assert.equal(
			resumeContextResult.details.task.id,
			"TASK-001",
			"Resume context tool should target requested task",
		);
		const agencyTool = extension.tools.get("codewiki_agency");
		assert.ok(
			agencyTool && typeof agencyTool.definition?.execute === "function",
			"Agency tool missing execute function",
		);
		const agencyResult = await agencyTool.definition.execute(
			"agency-tool-smoke",
			{
				repoPath: projectDir,
				mode: "maintain",
				dryRun: true,
				budget: { maxCycles: 2, maxWrites: 1, maxSubagents: 1, risk: "low" },
			},
			undefined,
			undefined,
			outsideToolCtx,
		);
		assert.equal(agencyResult.details.mode, "maintain");
		assert.equal(agencyResult.details.budget.maxWrites, 1);
		assert.ok(
			typeof agencyResult.details.stop.condition === "string",
			"Agency stop should have a condition string",
		);
		assert.equal(
			agencyResult.details.bounded_context.preferred_executor,
			"think_code_run",
			"Agency should expose optional ThinkCode context executor plan",
		);
		assert.equal(
			agencyResult.details.bounded_context.availability,
			"optional",
			"ThinkCode must remain optional for CodeWiki",
		);
		assert.ok(
			agencyResult.details.bounded_context.fallback.steps.length >= 1,
			"Agency should expose native fallback context steps",
		);

		const diffTableTool = extension.tools.get("codewiki_diff_table");
		assert.ok(
			diffTableTool && typeof diffTableTool.definition?.execute === "function",
			"Diff table tool missing execute function",
		);
		const diffResult = await diffTableTool.definition.execute(
			"diff-table-smoke",
			{
				repoPath: projectDir,
				action: "propose",
				table_id: "DT-SMOKE",
				summary: "Smoke diff rows",
				rows: [{ id: "DTR-001", current_state: "Old", desired_state: "New", rationale: "Smoke", affected_layers: ["roadmap"], risk: "low", user_action: "pending" }],
			},
			undefined,
			undefined,
			outsideToolCtx,
		);
		assert.equal(diffResult.details.table.rows[0].id, "DTR-001");

		const buildTool = extension.tools.get("codewiki_build");
		assert.ok(
			buildTool && typeof buildTool.definition?.execute === "function",
			"Build tool missing execute function",
		);
		const buildResult = await buildTool.definition.execute(
			"build-tool-smoke",
			{
				repoPath: projectDir,
				kind: "decision",
				summary: "Accepted decision smoke build.",
				slug: "decision-smoke",
				source: "smoke-test",
				diff_table: [{
					id: "DTR-001",
					current_state: "Decision intent is not persisted as approved diff rows.",
					desired_state: "Decision builds persist approved rows and KB mappings as durable handoff payloads.",
					rationale: "The planning loop needs a compact user-approved intent and knowledge contract.",
					affected_layers: ["decision", "builds"],
					risk: "low",
					user_action: "approved",
				}],
				assumptions: ["Smoke fixture can create build artifacts."],
				knowledge_changes: [".codewiki/kb/system/overview.md"],
				roadmap_changes: ["TASK-001"],
				row_to_kb_mappings: [{ row_id: "DTR-001", knowledge_refs: [".codewiki/kb/system/overview.md"], diagram_refs: ["component-map:application"], evidence: "Overview captures accepted decision." }],
				propagation: { direction: "system-first", product_impact: ["User-visible handoff semantics change."], downstream_planning_questions: ["Create implementation task if code must change."] },
				diagram_refs: ["component-map:application"],
				lifecycle: { ttl_days: 7 },
			},
			undefined,
			undefined,
			outsideToolCtx,
		);
		assert.match(buildResult.details.path, /\.codewiki\/builds\/decision\/.*decision-smoke\.json$/);
		const decisionBuild = JSON.parse(readFileSync(resolve(projectDir, buildResult.details.path), "utf8"));
		assert.equal(decisionBuild.kind, "decision_build");
		assert.equal(decisionBuild.status, "accepted");
		assert.equal(decisionBuild.lifecycle.ttl_days, 7);
		assert.equal(decisionBuild.schema_version, 2);
		assert.equal(decisionBuild.diff_table[0].user_action, "approved");
		assert.equal(decisionBuild.accepted_decisions[0].id, "D1");
		assert.equal(decisionBuild.propagation.direction, "system-first");

		// Planning build smoke
		const planBuildResult = await buildTool.definition.execute(
			"build-tool-plan-smoke",
			{
				repoPath: projectDir,
				kind: "planning",
				summary: "Planning build from decision.",
				slug: "plan-smoke",
				source_decision_build: buildResult.details.path,
				task_ids: ["TASK-001"],
				task_changes: ["TASK-001 planned for implementation"],
				decision_row_resolutions: [{ row_id: "DTR-001", resolution: "roadmap-task", task_ids: ["TASK-001"], evidence: "TASK-001 carries DTR-001 into implementation.", source_refs: [buildResult.details.path, "TASK-001"] }],
				downstream_question_resolutions: [{ question: "Create implementation task if code must change.", resolution: "roadmap-task", task_ids: ["TASK-001"], evidence: "TASK-001 is the implementation task for the downstream planning question.", source_refs: [buildResult.details.path, "TASK-001"] }],
				tdd_plan: ["Derive smoke assertions before code changes."],
				candidate_test_files: ["tests/smoke/package-smoke.test.mjs"],
				candidate_code_paths: ["src/index.ts"],
				requirements: [{ id: "REQ-SMOKE-001", text: "Decision builds must be durable handoff payloads.", source_refs: [buildResult.details.path] }],
				evidence_mapping: [{ criterion: "Roadmap task maps to requirement", evidence: "TASK-001 is the implementation target.", requirement_ids: ["REQ-SMOKE-001"], source_refs: [buildResult.details.path] }],
				lifecycle: { ttl_days: 14 },
			},
			undefined,
			undefined,
			outsideToolCtx,
		);
		assert.match(planBuildResult.details.path, /\.codewiki\/builds\/planning\/.*plan-smoke\.json$/);
		const planBuild = JSON.parse(readFileSync(resolve(projectDir, planBuildResult.details.path), "utf8"));
		assert.equal(planBuild.kind, "planning_build");
		assert.deepEqual(planBuild.consumes.decision, [buildResult.details.path]);
		assert.equal(planBuild.cycle.loop, "planning");
		assert.equal(planBuild.policy.profile, "planning");

		// Implementation build smoke
		const implBuildResult = await buildTool.definition.execute(
			"build-tool-impl-smoke",
			{
				repoPath: projectDir,
				kind: "implementation",
				summary: "Implementation build for task.",
				slug: "impl-smoke",
				task_id: "TASK-001",
				source_planning_build: planBuildResult.details.path,
				test_files: ["tests/smoke/package-smoke.test.mjs"],
				code_files: ["src/index.ts"],
				checks_run: ["npm test"],
				acceptance_mapping: [{ criterion: "Schemas exist", evidence: "npm test pass" }],
				test_design_evidence: ["Tester derived schema assertions from planning build before code changes."],
				code_change_evidence: ["Builder updated extension surface until smoke assertions passed."],
				tester_notes: ["No implementation changes in tester role."],
				builder_notes: ["Builder consumed tester evidence and checks."],
				validation_refs: [".codewiki/validation/smoke-pass.json"],
				closure_brief: {
					user_intent: "Decision builds must be durable handoff payloads.",
					implemented_changes: ["Recorded implementation build smoke evidence."],
					layers_updated: {
						roadmap: ["TASK-001"],
						code: ["src/index.ts"],
						tests: ["tests/smoke/package-smoke.test.mjs"],
						validation: [".codewiki/validation/smoke-pass.json"],
					},
					acceptance_evidence: ["Schemas exist: npm test pass"],
					checks: ["npm test"],
					non_goals_preserved: ["No remote publication."],
					remaining_risks: ["Smoke fixture only; no remote publication."],
				},
				risks: ["Smoke fixture only; no remote publication."],
				publication: {
					commit_title: "test: record implementation build smoke evidence",
					pr_body: "Smoke PR draft; not published.",
				},
				lifecycle: { ttl_days: 7 },
			},
			undefined,
			undefined,
			outsideToolCtx,
		);
		assert.match(implBuildResult.details.path, /\.codewiki\/builds\/implementation\/.*impl-smoke\.json$/);
		const implBuild = JSON.parse(readFileSync(resolve(projectDir, implBuildResult.details.path), "utf8"));
		assert.equal(implBuild.kind, "implementation_build");
		assert.equal(implBuild.task_id, "TASK-001");
		assert.equal(implBuild.task.id, "TASK-001");
		assert.equal(implBuild.acceptance_mapping.length, 1);
		assert.equal(implBuild.validation_refs[0], ".codewiki/validation/smoke-pass.json");
		assert.equal(implBuild.closure_brief.user_intent, "Decision builds must be durable handoff payloads.");
		assert.deepEqual(implBuild.consumes.planning, [planBuildResult.details.path]);
		assert.deepEqual(implBuild.produces.closure, ["TASK-001"]);
		assert.equal(implBuild.test_design_evidence[0], "Tester derived schema assertions from planning build before code changes.");
		assert.equal(implBuild.code_change_evidence[0], "Builder updated extension surface until smoke assertions passed.");
		assert.equal(implBuild.role_evidence.tester.role, "tester");
		assert.equal(implBuild.role_evidence.builder.role, "builder");
		assert.equal(implBuild.role_evidence.tester.source_planning_build, planBuildResult.details.path);
		assert.equal(implBuild.role_evidence.builder.code_files[0], "src/index.ts");
		assert.equal(implBuild.handoff.resume.source, "implementation_build");
		assert.equal(implBuild.handoff.resume.command, "/wiki-resume TASK-001");
		assert.equal(implBuild.handoff.resume.context.source, "implementation_build");
		assert.equal(implBuild.publication.policy.execution, "recommendation_only");
		assert.equal(implBuild.publication.policy.approval_required, true);
		assert.equal(implBuild.publication.push_readiness.allowed_by_default, false);
		assert.equal(implBuild.publication.commit.title, "test: record implementation build smoke evidence");

		// Validation report smoke
		const validationTool = extension.tools.get("codewiki_validation");
		assert.ok(
			validationTool && typeof validationTool.definition?.execute === "function",
			"Validation tool missing execute function",
		);
		const taskCloseAuditRefs = ["audit:alignment", "audit:changed", "audit:task", "audit:generated-parity"];
		const passReport = await validationTool.definition.execute(
			"validation-pass-smoke",
			{
				repoPath: projectDir,
				profile: "task-close",
				task_id: "TASK-001",
				verdict: "pass",
				rationale: "All acceptance criteria met.",
				checks: ["npm test", "npm run typecheck"],
				issues: [],
				audit_refs: taskCloseAuditRefs,
				isolation: {
					role: "validator",
					fresh_context: true,
					clean: true,
					published_sha: "def5678",
					tree_sha: "abc1234",
					builder_session_id: "smoke-builder-session",
				},
			},
			undefined,
			undefined,
			outsideToolCtx,
		);
		assert.match(passReport.details.path, /\.codewiki\/validation\/.*task-close-pass.*\.json$/);
		const passVal = JSON.parse(readFileSync(resolve(projectDir, passReport.details.path), "utf8"));
		assert.equal(passVal.kind, "validation_report");
		assert.equal(passVal.verdict, "pass");

		const failReport = await validationTool.definition.execute(
			"validation-fail-smoke",
			{
				repoPath: projectDir,
				profile: "decision",
				verdict: "fail",
				rationale: "Knowledge changes don't match the decision build.",
				issues: [{ severity: "high", summary: "Missing spec update." }],
			},
			undefined,
			undefined,
			outsideToolCtx,
		);
		assert.match(failReport.details.path, /\.codewiki\/validation\/.*decision-fail.*\.json$/);
		const failVal = JSON.parse(readFileSync(resolve(projectDir, failReport.details.path), "utf8"));
		assert.equal(failVal.verdict, "fail");
		assert.equal(failVal.issues.length, 1);

		const taskTool = extension.tools.get("codewiki_task");
		assert.ok(
			taskTool && typeof taskTool.definition?.execute === "function",
			"Task tool missing execute function",
		);
		await taskTool.definition.execute(
			"task-create-smoke",
			{
				repoPath: projectDir,
				action: "create",
				tasks: [
					{
						title: "Smoke audit task",
						priority: "high",
						kind: "agent-workflow",
						summary: "Track unresolved smoke-test delta.",
						spec_paths: [".codewiki/kb/product/overview.md"],
						code_paths: [],
						research_ids: [],
						labels: ["smoke"],
						goal: {
							outcome:
								"Smoke repo can persist goal-shaped roadmap task metadata.",
							acceptance: [
								"Appended task stores success signals.",
								"Generated roadmap view renders goal metadata.",
							],
							non_goals: [
								"Exercise every future automation workflow in smoke coverage.",
							],
							verification: [
								"Append task through package tool.",
								"Rebuild generated outputs.",
							],
						},
						delta: {
							desired: "Smoke repo has structured task append flow.",
							current: "Task was not yet appended.",
							closure: "Append one roadmap task through package tool.",
						},
					},
				],
			},
			undefined,
			undefined,
			outsideToolCtx,
		);
		const appendedRoadmap = JSON.parse(
			readFileSync(resolve(projectDir, ".codewiki", "roadmap", "queue.json"), "utf8"),
		);
		const appendedTaskId = Array.isArray(appendedRoadmap.order)
			? appendedRoadmap.order.find(
					(id) => appendedRoadmap.tasks[id]?.title === "Smoke audit task",
				)
			: undefined;
		assert.ok(
			appendedTaskId,
			"Roadmap order missing appended task before update",
		);
		const duplicateCreateResult = await taskTool.definition.execute(
			"task_create_duplicate_smoke",
			{
				repoPath: projectDir,
				action: "create",
				tasks: [
					{
						title: "Smoke audit task",
						priority: "high",
						kind: "agent-workflow",
						summary:
							"Duplicate smoke delta should be coordinated automatically.",
						spec_paths: [".codewiki/kb/product/overview.md"],
						code_paths: [],
						labels: ["smoke"],
					},
				],
			},
			undefined,
			undefined,
			outsideToolCtx,
		);
		assert.match(
			duplicateCreateResult.content?.[0]?.text ?? "",
			/reused/i,
			"Task tool should coordinate duplicate task intent automatically",
		);

		const distinctCreateResult = await taskTool.definition.execute(
			"task_create_distinct_scope_smoke",
			{
				repoPath: projectDir,
				action: "create",
				tasks: [
					{
						title: "Smoke scoped follow-up task",
						priority: "medium",
						kind: "agent-workflow",
						summary:
							"Same broad scope but different intent should become a new task.",
						spec_paths: [".codewiki/kb/product/overview.md"],
						labels: ["follow-up"],
					},
				],
			},
			undefined,
			undefined,
			outsideToolCtx,
		);
		assert.match(
			distinctCreateResult.content?.[0]?.text ?? "",
			/created/i,
			"Task tool should not reuse an unrelated task solely because broad scope overlaps",
		);
		const roadmapAfterDistinctCreate = JSON.parse(
			readFileSync(resolve(projectDir, ".codewiki", "roadmap", "queue.json"), "utf8"),
		);
		const distinctTaskId = Array.isArray(roadmapAfterDistinctCreate.order)
			? roadmapAfterDistinctCreate.order.find(
					(id) =>
						roadmapAfterDistinctCreate.tasks[id]?.title ===
						"Smoke scoped follow-up task",
				)
			: undefined;
		assert.ok(distinctTaskId, "Distinct smoke follow-up task id missing");
		const sprintResult = await taskTool.definition.execute(
			"task-sprint-smoke",
			{
				repoPath: projectDir,
				action: "sprint",
				sprint: {
					title: "Smoke related work sprint",
					status: "active",
					outcome: "Related smoke tasks stay grouped without a container task.",
					task_ids: [appendedTaskId, distinctTaskId],
					scope: {
						knowledge: [".codewiki/kb/product/overview.md"],
						code: ["tests/smoke/package-smoke.test.mjs"],
					},
					gates: ["validation", "package-smoke"],
				},
			},
			undefined,
			undefined,
			outsideToolCtx,
		);
		assert.match(sprintResult.content?.[0]?.text ?? "", /sprint created SPRINT-\d+/, "Task tool should create sprint metadata through safe action");
		const roadmapAfterSprint = JSON.parse(
			readFileSync(resolve(projectDir, ".codewiki", "roadmap", "queue.json"), "utf8"),
		);
		const smokeSprint = Object.values(roadmapAfterSprint.sprints || {}).find((sprint) => sprint.title === "Smoke related work sprint");
		assert.ok(smokeSprint, "Sprint metadata should be written through the task tool, not by hand");
		assert.deepEqual(smokeSprint.task_ids, [appendedTaskId, distinctTaskId]);

		await taskTool.definition.execute(
			"task_update_smoke_1",
			{
				repoPath: projectDir,
				action: "update",
				taskId: appendedTaskId,
				evidence: {
					result: "pass",
					summary: "Implementation evidence recorded; ready for validation gateway.",
				},
			},
			undefined,
			undefined,
			outsideToolCtx,
		);
		await taskTool.definition.execute(
			"task_update_smoke_2",
			{
				repoPath: projectDir,
				action: "update",
				taskId: appendedTaskId,
				evidence: {
					result: "pass",
					summary: "Validation gateway evidence passed.",
					checks_run: ["npm test"],
				},
			},
			undefined,
			undefined,
			outsideToolCtx,
		);
		await validationTool.definition.execute(
			"task-close-validation-smoke",
			{
				repoPath: projectDir,
				profile: "task-close",
				task_id: appendedTaskId,
				verdict: "pass",
				rationale: "Smoke task has immutable close proof.",
				audit_refs: taskCloseAuditRefs,
				isolation: {
					role: "validator",
					fresh_context: true,
					clean: true,
					published_sha: "def5678",
					tree_sha: "abc1234",
				},
			},
			undefined,
			undefined,
			outsideToolCtx,
		);
		await taskTool.definition.execute(
			"task_close_smoke",
			{
				repoPath: projectDir,
				action: "close",
				taskId: appendedTaskId,
				summary:
					"Close smoke-test delta through canonical task tool after validation pass.",
			},
			undefined,
			undefined,
			outsideToolCtx,
		);
		await taskTool.definition.execute(
			"task_update_metadata_smoke",
			{
				repoPath: projectDir,
				action: "update",
				taskId: appendedTaskId,
				patch: {
					labels: ["smoke", "closed"],
					goal: {
						verification: [
							"Update existing roadmap task through package tool.",
							"Rebuild generated outputs after mutation.",
						],
					},
					delta: {
						current:
							"Task was appended and then moved to done through the unified task tool before a follow-up metadata update.",
						closure:
							"Update existing roadmap task through package tool and rebuild generated outputs.",
					},
				},
			},
			undefined,
			undefined,
			outsideToolCtx,
		);
		const taskDetailStateResult = await stateTool.definition.execute(
			"state-task-detail-smoke",
			{ repoPath: projectDir, taskId: appendedTaskId, include: ["task"] },
			undefined,
			undefined,
			outsideToolCtx,
		);
		assert.equal(
			taskDetailStateResult.details.task.id,
			appendedTaskId,
			"State tool should return requested task detail",
		);
		assert.equal(
			taskDetailStateResult.details.task.status,
			"done",
			"State tool task detail should reflect canonical task status",
		);
		assert.equal(
			taskDetailStateResult.details.task.context_packet?.task?.id,
			appendedTaskId,
			"State tool should surface compact task context packet",
		);
		assert.match(
			taskDetailStateResult.details.task.context_path ?? "",
			new RegExp(`\\.codewiki/roadmap/tasks/${appendedTaskId}/context\\.json`),
			"State tool should point to task-local context shard",
		);

		const artifactStatusTool = extension.tools.get("codewiki_artifact_status");
		assert.ok(
			artifactStatusTool && typeof artifactStatusTool.definition?.execute === "function",
			"Artifact status tool missing execute function",
		);
		assert.equal(extension.tools.has("codewiki_claim"), false, "Deprecated claim alias should not be registered");
		const claimResult = await artifactStatusTool.definition.execute(
			"artifact-status-create-smoke",
			{
				repoPath: projectDir,
				action: "mark",
				taskId: "TASK-001",
				summary: "Mark product docs for smoke parallel work.",
				mode: "write",
				scopes: [{ layer: "knowledge", path: ".codewiki/kb/product/**" }],
				ttl_minutes: 30,
			},
			undefined,
			undefined,
			outsideToolCtx,
		);
		assert.match(claimResult.details.claim.id, /^CLAIM-\d+$/, "Artifact status tool should allocate a holder id");
		const otherSessionCtx = {
			...outsideToolCtx,
			sessionManager: {
				...outsideToolCtx.sessionManager,
				getSessionId: () => "session-smoke-2",
				getBranch: () => [],
			},
		};
		const readOverlapResult = await artifactStatusTool.definition.execute(
			"artifact-status-read-overlap-smoke",
			{
				repoPath: projectDir,
				action: "mark",
				summary: "Read overlapping product docs for smoke parallel work.",
				mode: "read",
				scopes: [{ layer: "knowledge", path: ".codewiki/kb/product/overview.md" }],
				ttl_minutes: 30,
			},
			undefined,
			undefined,
			otherSessionCtx,
		);
		assert.ok(
			readOverlapResult.details.conflicts.some((conflict) => conflict.kind === "warning"),
			"Read/write overlap should create a warning",
		);
		await assert.rejects(
			() => artifactStatusTool.definition.execute(
				"artifact-status-write-conflict-smoke",
				{
					repoPath: projectDir,
					action: "mark",
					summary: "Conflicting product docs write holder.",
					mode: "write",
					scopes: [{ layer: "knowledge", path: ".codewiki/kb/product/overview.md" }],
				},
				undefined,
				undefined,
				otherSessionCtx,
			),
			/codewiki_artifact_status conflict/i,
			"Write/write overlap should block by default",
		);
		const claimStateResult = await stateTool.definition.execute(
			"state-claims-smoke",
			{ repoPath: projectDir, refresh: true, include: ["claims", "session"] },
			undefined,
			undefined,
			outsideToolCtx,
		);
		assert.equal(claimStateResult.details.claims.active_claim_count, 2, "State should expose active artifact records");
		assert.equal(claimStateResult.details.claims.warning_count, 1, "State should expose artifact overlap warnings");
		assert.ok(
			claimStateResult.details.claims.artifact_statuses.some((status) => status.status === "in-use"),
			"State should expose artifact-status records derived from session queue",
		);
		const artifactMarkResult = await artifactStatusTool.definition.execute(
			"artifact-status-mark-smoke",
			{
				repoPath: projectDir,
				action: "mark",
				taskId: "TASK-001",
				summary: "Mark source file artifact in use through public artifact-status API.",
				mode: "write",
				scopes: [{ layer: "code", path: "src/index.ts" }],
				ttl_minutes: 30,
			},
			undefined,
			undefined,
			outsideToolCtx,
		);
		assert.match(
			artifactMarkResult.content[0]?.text ?? "",
			/artifact-status: mark/i,
			"Artifact status tool should report artifact-status terminology",
		);
		assert.ok(
			artifactMarkResult.details.artifact_statuses.some((status) => status.artifact.path === "src/index.ts"),
			"Artifact status tool should return marked artifact status",
		);
		await artifactStatusTool.definition.execute(
			"artifact-status-release-smoke",
			{ repoPath: projectDir, action: "release", recordId: artifactMarkResult.details.claim.id },
			undefined,
			undefined,
			outsideToolCtx,
		);
		await artifactStatusTool.definition.execute(
			"artifact-status-release-smoke-1",
			{ repoPath: projectDir, action: "release", recordId: claimResult.details.claim.id },
			undefined,
			undefined,
			outsideToolCtx,
		);
		await artifactStatusTool.definition.execute(
			"artifact-status-release-smoke-2",
			{ repoPath: projectDir, action: "release", recordId: readOverlapResult.details.claim.id },
			undefined,
			undefined,
			outsideToolCtx,
		);
		const releasedClaimStateResult = await stateTool.definition.execute(
			"state-claims-released-smoke",
			{ repoPath: projectDir, refresh: true, include: ["claims"] },
			undefined,
			undefined,
			outsideToolCtx,
		);
		assert.equal(releasedClaimStateResult.details.claims.active_claim_count, 0, "Released claims should leave active state");
		const smokeClaimsPath = resolve(projectDir, ".codewiki", "session", "queue.json");
		const smokeClaims = JSON.parse(readFileSync(smokeClaimsPath, "utf8"));
		smokeClaims.claims.push({
			id: "CLAIM-999",
			session_id: "session-expired",
			agent_name: "Expired Agent",
			status: "active",
			mode: "write",
			summary: "Expired claim fixture.",
			scopes: [{ layer: "code", path: "src/**" }],
			created_at: "2000-01-01T00:00:00.000Z",
			updated_at: "2000-01-01T00:00:00.000Z",
			expires_at: "2000-01-01T00:00:00.000Z",
		});
		writeFileSync(smokeClaimsPath, JSON.stringify(smokeClaims, null, 2));
		const expiredClaimStateResult = await stateTool.definition.execute(
			"state-claims-expired-smoke",
			{ repoPath: projectDir, refresh: true, include: ["claims"] },
			undefined,
			undefined,
			outsideToolCtx,
		);
		assert.equal(expiredClaimStateResult.details.claims.active_claim_count, 0, "Expired claims should not be active");

		const sessionTool = extension.tools.get("codewiki_session");
		assert.ok(
			sessionTool && typeof sessionTool.definition?.execute === "function",
			"Session tool missing execute function",
		);
		await sessionTool.definition.execute(
			"session-focus-smoke",
			{
				repoPath: projectDir,
				taskId: "TASK-001",
				action: "focus",
				summary: "Focused smoke session on starter task.",
				setSessionName: true,
			},
			undefined,
			undefined,
			outsideToolCtx,
		);
		const implicitStateResult = await stateTool.definition.execute(
			"state-outside-implicit-smoke",
			{},
			undefined,
			undefined,
			outsideToolCtx,
		);
		assert.equal(
			implicitStateResult.details.repo.repo_root,
			projectDir,
			"State tool should reuse remembered repo when outside cwd has no local wiki",
		);
		sessionEntries.push({
			type: "custom",
			customType: "codewiki.task-link",
			timestamp: "2026-04-17T15:10:00Z",
			data: {
				taskId: "TASK-001",
				action: "focus",
				summary: "Focused smoke session on starter task.",
				filesTouched: ["src/index.ts"],
				spawnedTaskIds: [],
			},
		});
		const implicitSessionNoteResult = await sessionTool.definition.execute(
			"session-note-implicit-smoke",
			{
				action: "note",
				summary:
					"Implicit repo resolution should reuse remembered repo context.",
				files_touched: ["src/index.ts"],
			},
			undefined,
			undefined,
			outsideToolCtx,
		);
		assert.match(
			implicitSessionNoteResult.content[0]?.text ?? "",
			/codewiki session: note TASK-001/i,
			"Session tool should reuse remembered repo and focused task when outside cwd has no local wiki",
		);

		const statusNotifications = [];
		const resumeNotifications = [];
		const resumeBarrierNotifications = [];
		const errorNotifications = [];
		const taskStatuses = [];
		const statusSummaries = [];
		const channelInputQueue = [];
		const widgetState = { key: null, content: null, options: null };
		const panelState = { renderedLines: null, terminalInput: null };
		const configPanelState = {
			options: null,
			renderedLines: null,
			instance: null,
			error: null,
			terminalInput: null,
			widget: null,
		};
		const auditCommand = extension.commands.get("audit");
		const configCommand = extension.commands.get("wiki-config");
		const statusCommand = extension.commands.get("wiki-status");
		const resumeCommand = extension.commands.get("wiki-resume");
		const statusShortcut = extension.shortcuts.get("alt+w");
		assert.ok(
			auditCommand && typeof auditCommand.handler === "function",
			"audit command missing handler",
		);
		assert.ok(
			configCommand && typeof configCommand.handler === "function",
			"wiki-config command missing handler",
		);
		assert.ok(
			statusCommand && typeof statusCommand.handler === "function",
			"wiki-status command missing handler",
		);
		assert.ok(
			resumeCommand && typeof resumeCommand.handler === "function",
			"wiki-resume command missing handler",
		);
		assert.ok(
			statusShortcut && typeof statusShortcut.handler === "function",
			"alt+w shortcut missing handler",
		);
		await configCommand.handler("", {
			cwd: projectDir,
			isIdle: () => true,
			sessionManager: toolCtx.sessionManager,
			ui: {
				notify: (message, level) =>
					statusNotifications.push({ message, level }),
				input: async () => undefined,
				select: async () => undefined,
				setWidget: (_key, content, options) => {
					configPanelState.widget = content;
					configPanelState.options = options;
					if (typeof content === "function") {
						const instance = content(
							{ terminal: { columns: 120, rows: 32 } },
							{
								fg: (_color, text) => text,
								bg: (_color, text) => text,
								bold: (text) => text,
							},
						);
						configPanelState.instance = instance;
						configPanelState.renderedLines = instance.render(56);
					}
				},
				onTerminalInput: (handler) => {
					configPanelState.terminalInput = handler;
					return () => {
						configPanelState.terminalInput = null;
					};
				},
			},
		});
		assert.deepEqual(
			configPanelState.options,
			{ placement: "aboveEditor" },
			"wiki-config should render as a top widget like status panel",
		);
		assert.equal(
			configPanelState.error,
			null,
			`wiki-config config panel threw: ${configPanelState.error}`,
		);
		assert.ok(
			configPanelState.widget && configPanelState.instance,
			"wiki-config should render an interactive top-pinned configuration panel",
		);
		await statusShortcut.handler({
			cwd: projectDir,
			isIdle: () => true,
			sessionManager: toolCtx.sessionManager,
			ui: {
				notify: (message, level) =>
					statusNotifications.push({ message, level }),
				input: async () => channelInputQueue.shift(),
				select: async () => undefined,
				setStatus: (key, value) => statusSummaries.push({ key, value }),
				setWidget: (key, content, options) => {
					widgetState.key = key;
					widgetState.content = content;
					widgetState.options = options;
				},
				onTerminalInput: (handler) => {
					panelState.terminalInput = handler;
					return () => {
						panelState.terminalInput = null;
					};
				},
			},
		});
		const autoDockPrefs = JSON.parse(
			readFileSync(resolve(projectDir, ".pi", "codewiki-status.json"), "utf8"),
		);
		assert.equal(
			autoDockPrefs.mode,
			"auto",
			"wiki-config should keep auto summary mode unless explicitly pinned",
		);
		assert.equal(
			autoDockPrefs.lastRepoPath,
			projectDir,
			"panel toggle should remember the last resolved repo for future global sessions",
		);
		widgetState.key = null;
		widgetState.content = null;
		widgetState.options = null;
		await configCommand.handler("auto", {
			cwd: outsideDir,
			isIdle: () => true,
			sessionManager: toolCtx.sessionManager,
			ui: {
				notify: (message, level) =>
					statusNotifications.push({ message, level }),
				setStatus: (key, value) => statusSummaries.push({ key, value }),
				setWidget: (key, content, options) => {
					widgetState.key = key;
					widgetState.content = content;
					widgetState.options = options;
				},
			},
		});
		const latestSummary = statusSummaries.at(-1)?.value ?? "";
		assert.ok(
			String(latestSummary).startsWith("codewiki: ") &&
				String(latestSummary).split(" · ").length >= 3,
			"Status summary auto mode should keep a compact extension-labeled health summary outside repo cwd",
		);
		assert.ok(
			String(latestSummary).includes("🟢") ||
				String(latestSummary).includes("🟡") ||
				String(latestSummary).includes("🔴"),
			"Status summary should include a traffic-light circle for repo health",
		);
		await configCommand.handler(`pin ${projectDir}`, {
			cwd: outsideDir,
			isIdle: () => true,
			sessionManager: toolCtx.sessionManager,
			ui: {
				notify: (message, level) =>
					statusNotifications.push({ message, level }),
				setStatus: (key, value) => statusSummaries.push({ key, value }),
				setWidget: (key, content, options) => {
					widgetState.key = key;
					widgetState.content = content;
					widgetState.options = options;
				},
			},
		});
		const dockPrefs = JSON.parse(
			readFileSync(resolve(projectDir, ".pi", "codewiki-status.json"), "utf8"),
		);
		assert.equal(
			dockPrefs.mode,
			"pin",
			"wiki-config pin should persist pinned summary mode",
		);
		assert.equal(
			dockPrefs.pinnedRepoPath,
			projectDir,
			"wiki-config pin should persist pinned repo path",
		);
		await resumeCommand.handler("", {
			cwd: outsideDir,
			hasUI: true,
			isIdle: () => true,
			sessionManager: toolCtx.sessionManager,
			ui: {
				custom: async () => projectDir,
				notify: (message, level) =>
					resumeNotifications.push({ message, level }),
				setStatus: (key, value) => {
					taskStatuses.push({ key, value });
					statusSummaries.push({ key, value });
				},
				setWidget: (key, content, options) => {
					widgetState.key = key;
					widgetState.content = content;
					widgetState.options = options;
				},
			},
		});

		await configCommand.handler("pin", {
			cwd: blankDir,
			isIdle: () => true,
			sessionManager: toolCtx.sessionManager,
			ui: {
				notify: (message, level) => errorNotifications.push({ message, level }),
			},
		});

		await extension.hooks?.onTurnStart?.(
			{ role: "user", content: "check status" },
			{
				cwd: outsideDir,
				ui: {
					setStatus: () => {},
					setWidget: () => {},
					notify: (message, level) =>
						errorNotifications.push({ message, level }),
				},
				sessionManager: {
					getSessionId: () => "session-no-branch",
				},
			},
		);

		await taskTool.definition.execute(
			"task_validation_fail_smoke",
			{
				repoPath: projectDir,
				action: "update",
				taskId: "TASK-001",
				evidence: {
					result: "fail",
					summary: "Validation gateway found remaining gaps before done.",
					checks_run: ["npm test"],
					files_touched: ["src/index.ts"],
					issues: ["Need explicit closure evidence gate."],
				},
			},
			undefined,
			undefined,
			outsideToolCtx,
		);
		await resumeCommand.handler("TASK-001", {
			cwd: projectDir,
			hasUI: true,
			ui: {
				notify: (message, level) =>
					resumeNotifications.push({ message, level }),
				setStatus: (key, value) => taskStatuses.push({ key, value }),
			},
			sessionManager: toolCtx.sessionManager,
		});
		await resumeCommand.handler("TASK-002", {
			cwd: projectDir,
			hasUI: true,
			ui: {
				notify: (message, level) =>
					resumeBarrierNotifications.push({ message, level }),
				setStatus: () => {},
			},
			sessionManager: toolCtx.sessionManager,
		});
		const freshResumePrompts = [];
		await resumeCommand.handler("--new TASK-001 -- keep context clean", {
			cwd: projectDir,
			hasUI: true,
			ui: {
				notify: (message, level) =>
					resumeNotifications.push({ message, level }),
				setStatus: (key, value) => taskStatuses.push({ key, value }),
			},
			sessionManager: toolCtx.sessionManager,
			newSession: async (options) => {
				assert.equal(options.parentSession, resolve(projectDir, ".pi", "sessions", "session-smoke-1.jsonl"));
				await options.withSession({
					ui: { notify: () => {}, setStatus: () => {}, setWidget: () => {} },
					sessionManager: {
						...toolCtx.sessionManager,
						getSessionId: () => "session-smoke-fresh",
						getSessionFile: () => resolve(projectDir, ".pi", "sessions", "session-smoke-fresh.jsonl"),
					},
					sendUserMessage: async (prompt) => freshResumePrompts.push(prompt),
				});
				return { cancelled: false };
			},
		});
		assert.match(
			freshResumePrompts.at(-1) ?? "",
			/Implement roadmap task TASK-001/i,
			"wiki-resume --new should seed the replacement session with resume context",
		);
		assert.match(
			resumeNotifications.at(-1)?.message ?? "",
			/starting fresh session in_progress for TASK-001/i,
			"wiki-resume --new should announce fresh-session resume",
		);
		await taskTool.definition.execute(
			"task_persisted_focus_validation_smoke",
			{
				repoPath: projectDir,
				action: "update",
				taskId: distinctTaskId,
				evidence: {
					result: "pass",
					summary: "Persisted focus smoke task ready for validation gateway.",
					checks_run: ["npm test"],
				},
			},
			undefined,
			undefined,
			outsideToolCtx,
		);
		const persistedFocusRoadmap = JSON.parse(
			readFileSync(resolve(projectDir, ".codewiki", "roadmap", "queue.json"), "utf8"),
		);
		persistedFocusRoadmap.tasks[distinctTaskId].status = "in_progress";
		writeFileSync(
			resolve(projectDir, ".codewiki", "roadmap", "queue.json"),
			JSON.stringify(persistedFocusRoadmap, null, 2),
		);
		await sessionTool.definition.execute(
			"session-persisted-focus-smoke",
			{
				repoPath: projectDir,
				taskId: distinctTaskId,
				action: "focus",
				summary: "Persisted focus should survive fresh session resume.",
			},
			undefined,
			undefined,
			{
				...outsideToolCtx,
				sessionManager: {
					getSessionId: () => "session-persisted-focus",
					getBranch: () => [],
				},
			},
		);
		assert.ok(
			!existsSync(resolve(projectDir, ".codewiki", "roadmap", "events.jsonl")),
			"Session focus should not create a raw roadmap event log",
		);
		const namedRegressionRoadmap = JSON.parse(
			readFileSync(resolve(projectDir, ".codewiki", "roadmap", "queue.json"), "utf8"),
		);
		namedRegressionRoadmap.tasks["TASK-29"] = {
			id: "TASK-29",
			title: "Add architecture boundary checks and characterization coverage",
			status: "in_progress",
			priority: "high",
			kind: "testing",
			summary: "Ordering-regression fixture for earlier active task.",
			spec_paths: [".codewiki/kb/product/overview.md"],
			created: "2099-01-01T00:00:00Z",
			updated: "2099-01-01T00:00:00Z",
		};
		namedRegressionRoadmap.tasks["TASK-033"] = {
			id: "TASK-033",
			title: "Checkpoint stable refactor baseline before next roadmap",
			status: "in_progress",
			priority: "critical",
			kind: "verification",
			summary: "Persisted-focus regression fixture for fresh-session resume.",
			spec_paths: [".codewiki/kb/product/overview.md"],
			created: "2099-01-01T00:00:00Z",
			updated: "2099-01-01T00:00:00Z",
		};
		namedRegressionRoadmap.order = [
			...(Array.isArray(namedRegressionRoadmap.order)
				? namedRegressionRoadmap.order.filter(
						(id) => id !== "TASK-29" && id !== "TASK-033",
					)
				: []),
			"TASK-29",
			"TASK-033",
		];
		writeFileSync(
			resolve(projectDir, ".codewiki", "roadmap", "queue.json"),
			JSON.stringify(namedRegressionRoadmap, null, 2),
		);
		assert.ok(
			!existsSync(resolve(projectDir, ".codewiki", "roadmap", "events.jsonl")),
			"Roadmap focus should not use a raw event log",
		);

		const graph = JSON.parse(
			readFileSync(resolve(projectDir, ".codewiki", "index_graph.json"), "utf8"),
		);
		const lint = graph.lenses.lint;
		const config = JSON.parse(
			readFileSync(resolve(projectDir, ".codewiki", "config.json"), "utf8"),
		);
		const systemText = readFileSync(
			resolve(projectDir, ".codewiki", "kb", "system", "overview.md"),
			"utf8",
		);
		const frontendSpecText = readFileSync(
			resolve(
				projectDir,
				".codewiki",
				"kb",
				"system",
				"frontend.md",
			),
			"utf8",
		);
		const roadmapJson = JSON.parse(
			readFileSync(resolve(projectDir, ".codewiki", "roadmap", "queue.json"), "utf8"),
		);
		const roadmapState = graph.lenses.roadmap;
		const statusState = graph.lenses.status;
		const roadmapFolderIndex = roadmapState;
		const statusView = statusState;
		const roadmapQueueView = roadmapState;
		let panelLines = panelState.renderedLines ?? [];
		assert.ok(
			!existsSync(resolve(nestedDir, "wiki")),
			"Bootstrap should anchor wiki at the existing wiki root, not nested cwd",
		);

		assert.equal(
			first.created.length,
			25,
			`Expected 25 created starter files including lexicon, product users/stories/uis, flat system docs, roadmap queue, and inferred boundary specs, got ${first.created.length}`,
		);
		assert.equal(
			first.updated.length,
			0,
			"Initial bootstrap should not update files",
		);
		assert.equal(
			second.created.length,
			0,
			"Second bootstrap should not create files",
		);
		assert.equal(
			second.updated.length,
			0,
			"Second bootstrap should not update files without force",
		);
		assert.equal(
			second.skipped.length,
			25,
			`Expected 25 skipped starter files, got ${second.skipped.length}`,
		);
		const nonStarterIssues = lint.issues.filter((i) => i.kind !== "unscoped-doc");
		assert.equal(
			nonStarterIssues.length,
			0,
			`Expected zero lint issues (excluding unscoped-doc starter warnings), got ${nonStarterIssues.length}: ${JSON.stringify(nonStarterIssues)}`,
		);
		assert.equal(config.views_root, ".codewiki/views");
		assert.equal(statusView.version, statusState.version);
		assert.ok(
			!existsSync(resolve(projectDir, ".codewiki", "status-state.json")),
			"Status state should live inside index_graph.json, not a separate generated view",
		);
		assert.ok(
			!existsSync(resolve(projectDir, ".codewiki", "roadmap-state.json")),
			"Roadmap state should live inside index_graph.json, not a separate generated view",
		);
		assert.ok(
			!existsSync(resolve(projectDir, ".codewiki", "graph.json")),
			"Generated graph view should be index_graph.json only",
		);
		assert.ok(
			!existsSync(resolve(projectDir, ".codewiki", "lint.json")),
			"Lint state should live inside index_graph.json, not a separate generated view",
		);
		assert.ok(
			graph.lenses?.lint && graph.lenses?.roadmap && graph.lenses?.status,
			"index_graph.json should include graph state-machine lenses",
		);
		assert.ok(
			graph.views?.reconciliation,
			"index_graph.json should include graph reconciliation state machine",
		);
		assert.equal(
			graph.views.reconciliation.controller,
			"reconciliation_gateway",
			"Reconciliation view should be a gateway/controller, not a compiler",
		);
		assert.ok(
			Array.isArray(graph.views.reconciliation.items) &&
				!graph.views.reconciliation.items.some(
					(item) =>
						item.source_id === `build:${buildResult.details.path}` &&
						item.next_loop === "planning" &&
						item.direction === "downward",
				),
			"Accepted decision build with downstream planning should be consumed",
		);
		assert.ok(
			Array.isArray(graph.nodes) &&
				graph.nodes.some(
					(node) =>
						node.kind === "validation_report" &&
						node.path === passReport.details.path &&
						node.verdict === "pass",
				),
			"Passing validation report should appear as a graph node",
		);
		assert.ok(
			Array.isArray(graph.nodes) &&
				graph.nodes.some(
					(node) =>
						node.kind === "validation_report" &&
						node.path === failReport.details.path &&
						node.verdict === "fail",
				),
			"Failing validation report should appear as a graph node",
		);
		assert.ok(
			Array.isArray(graph.views.reconciliation.items) &&
				graph.views.reconciliation.items.some(
					(item) => item.source_id === `validation:${failReport.details.path}`,
				),
			"Failing validation report should create a reconciliation item",
		);
		const graphDocNodes = Array.isArray(graph.nodes)
			? graph.nodes.filter((node) => node.kind === "doc")
			: [];
		assert.ok(
			graphDocNodes.length >= 6,
			"Expected generated graph doc nodes including inferred boundary specs",
		);
		assert.ok(
			Array.isArray(graph.nodes) && graph.nodes.length >= graphDocNodes.length,
			"Expected generated graph nodes",
		);
		assert.ok(
			Array.isArray(graph.edges) &&
				graph.edges.some((edge) => edge.kind === "task_spec"),
			"Expected generated graph task→spec edges",
		);
		assert.ok(
			graph.views?.docs?.by_group?.system?.includes(
				".codewiki/kb/system/overview.md",
			),
			"Expected system overview in graph docs-by-group view",
		);
		assert.ok(
			!graphDocNodes.some((doc) => doc.path === "wiki/roadmap.md"),
			"Generated roadmap.md should not exist in .codewiki/-only default graph docs",
		);
		assert.ok(
			graphDocNodes.some(
				(doc) => doc.path === ".codewiki/kb/system/validation-gateway.md",
			),
			"Expected validation gateway policy spec in graph docs",
		);
		assert.ok(
			graphDocNodes.some(
				(doc) => doc.path === ".codewiki/kb/system/frontend.md",
			),
			"Expected inferred frontend spec in graph docs",
		);
		assert.ok(
			graphDocNodes.some(
				(doc) => doc.path === ".codewiki/kb/system/backend.md",
			),
			"Expected inferred backend spec in graph docs",
		);
		assert.ok(
			graphDocNodes.some(
				(doc) => doc.path === ".codewiki/kb/system/packages-sdk.md",
			),
			"Expected inferred package spec in graph docs",
		);
		assert.deepEqual(
			config.lint.repo_markdown,
			[
				"README.md",
				"backend/**/README.md",
				"frontend/**/README.md",
				"packages/sdk/**/README.md",
			],
			"Expected inferred repo markdown scope",
		);
		assert.deepEqual(
			config.codewiki.code_drift_scope.code,
			["backend/**", "frontend/**", "packages/sdk/**"],
			"Expected inferred code drift scope",
		);
		assert.deepEqual(
			config.codewiki.gateway.write_paths,
			[".codewiki/kb/**", ".codewiki/sources/**", ".codewiki/research/**"],
			"Expected gateway write policy for direct wiki patches",
		);
		assert.ok(
			config.codewiki.gateway.generated_readonly_paths.includes(
				".codewiki/roadmap/tasks/**",
			),
			"Expected generated task context shards to be read-only through gateway patches",
		);
		assert.equal(
			config.codewiki.runtime.future_executor,
			"think-code",
			"Expected runtime policy to declare future think-code executor seam",
		);

		const gatewayTxPath = resolve(projectDir, "gateway-patch-smoke.json");
		writeFileSync(
			gatewayTxPath,
			JSON.stringify(
				{
					version: 1,
					summary: "Gateway patch smoke append.",
					ops: [
						{
							kind: "append_jsonl",
							path: ".codewiki/sources/runtime-smoke.jsonl",
							value: {
								id: "gateway-smoke-001",
								title: "Gateway smoke",
								summary: "Validated append-only source patch.",
							},
						},
					],
				},
				null,
				2,
			),
		);
		const gatewayApplyOutput = execFileSync(
			"node",
			[
				resolve(repoRoot, "scripts", "codewiki-gateway.mjs"),
				"apply",
				gatewayTxPath,
				projectDir,
			],
			{ encoding: "utf8" },
		);
		assert.match(
			gatewayApplyOutput,
			/"kind": "append_jsonl"/,
			"Gateway apply should report append_jsonl patch op",
		);
		assert.match(
			readFileSync(
				resolve(projectDir, ".codewiki", "sources", "runtime-smoke.jsonl"),
				"utf8",
			),
			/gateway-smoke-001/,
			"Gateway patch should append source support inside .codewiki only",
		);
		writeFileSync(
			gatewayTxPath,
			JSON.stringify(
				{
					version: 1,
					summary: "Gateway patch deny generated file.",
					ops: [
						{
							kind: "patch",
							path: ".codewiki/roadmap/tasks/TASK-001/context.json",
							oldText: "TASK-001",
							newText: "TASK-001",
						},
					],
				},
				null,
				2,
			),
		);
		assert.throws(
			() =>
				execFileSync(
					"node",
					[
						resolve(repoRoot, "scripts", "codewiki-gateway.mjs"),
						"apply",
						gatewayTxPath,
						projectDir,
					],
					{ encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
				),
			/Generated\/read-only path/,
			"Gateway patch should reject generated task context writes",
		);
		assert.ok(
			!existsSync(resolve(projectDir, "wiki")),
			"Default .codewiki/-only bootstrap should not create top-level wiki exports",
		);
		assert.ok(
			!existsSync(resolve(projectDir, ".codewiki", "events.jsonl")),
			"Default bootstrap should not create legacy root .codewiki/events.jsonl",
		);
		assert.ok(
			!Object.hasOwn(config.codewiki || {}, "rebuild_command"),
			"Default config should not declare a legacy external rebuild command",
		);
		assert.equal(
			config.index_path,
			undefined,
			"Default config should not emit index_path",
		);
		assert.equal(
			config.roadmap_doc_path,
			undefined,
			"Default config should not emit roadmap_doc_path",
		);
		for (const productFile of [
			"lexicon.md",
			"product/users/maintainers.md",
			"product/users/agents.md",
			"product/stories/intent.md",
			"product/stories/navigation.md",
			"product/uis/status-panel.md",
			"product/uis/board.md",
			"system/adapters.md",
		]) {
			assert.ok(
				existsSync(resolve(projectDir, ".codewiki", "kb", productFile)),
				`Expected starter knowledge file ${productFile}`,
			);
		}
		assert.match(
			systemText,
			/Inferred brownfield boundaries/,
			"System overview missing inferred boundary section",
		);
		assert.match(
			systemText,
			/\[Frontend\]\(frontend\.md\)/,
			"System overview missing inferred frontend link",
		);
		assert.match(
			frontendSpecText,
			/^# Frontend/m,
			"Generated frontend boundary title mismatch",
		);
		assert.match(
			frontendSpecText,
			/`frontend`/,
			"Generated frontend boundary spec missing code path",
		);
		assert.ok(roadmapJson.tasks["TASK-001"], "Structured roadmap seed missing");
		assert.ok(
			!roadmapJson.tasks["ROADMAP-001"],
			"Canonical roadmap seed should no longer use ROADMAP ids",
		);
		assert.ok(
			Object.values(roadmapJson.tasks).some(
				(task) => task.title === "Smoke audit task",
			),
			"Task tool did not persist created task",
		);
		const appendedTaskIdFromJson = Array.isArray(roadmapJson.order)
			? roadmapJson.order.find(
					(id) => roadmapJson.tasks[id]?.title === "Smoke audit task",
				)
			: undefined;
		assert.ok(appendedTaskIdFromJson, "Roadmap order missing appended task");
		assert.match(
			appendedTaskIdFromJson ?? "",
			/^TASK-\d+$/,
			"Appended roadmap task should use canonical TASK ids",
		);
		assert.equal(
			roadmapJson.tasks[appendedTaskIdFromJson].status,
			"done",
			"Task tool should be able to close an existing task",
		);
		assert.equal(
			roadmapJson.tasks[appendedTaskIdFromJson].summary,
			"Close smoke-test delta through canonical task tool after validation pass.",
			"Task close action should persist closure summary",
		);
		assert.deepEqual(
			roadmapJson.tasks[appendedTaskIdFromJson].labels,
			["smoke", "closed"],
			"Task tool should replace labels",
		);
		assert.equal(
			roadmapJson.tasks[appendedTaskIdFromJson].goal.outcome,
			"Smoke repo can persist goal-shaped roadmap task metadata.",
			"Task create action should persist goal outcome",
		);
		assert.deepEqual(
			roadmapJson.tasks[appendedTaskIdFromJson].goal.verification,
			[
				"Update existing roadmap task through package tool.",
				"Rebuild generated outputs after mutation.",
			],
			"Task tool should replace goal verification steps",
		);
		assert.equal(
			roadmapJson.tasks[appendedTaskIdFromJson].delta.current,
			"Task was appended and then moved to done through the unified task tool before a follow-up metadata update.",
			"Task tool should persist delta changes",
		);
		assert.equal(
			roadmapJson.tasks[appendedTaskIdFromJson].title,
			"Smoke audit task",
			"Roadmap JSON missing appended task",
		);
		assert.ok(
			Array.isArray(roadmapJson.tasks[appendedTaskIdFromJson].goal.acceptance),
			"Roadmap JSON should render task success signals as structured data",
		);
		assert.ok(
			!existsSync(resolve(projectDir, ".codewiki", "roadmap", "events.jsonl")),
			"Roadmap mutations should not create a raw event log",
		);
		assert.ok(
			!existsSync(resolve(projectDir, ".codewiki", "task-session-index.json")),
			"Task session index cache should not be generated",
		);
		assert.equal(
			roadmapState.version,
			2,
			"Roadmap state should use session-free v2 contract",
		);
		const expectedHealthColor = lint.issues.every((i) => i.kind === "unscoped-doc") ? "yellow" : "green";
		assert.equal(
			roadmapState.health.color,
			expectedHealthColor,
			"Roadmap state should embed deterministic lint health",
		);
		assert.equal(
			roadmapState.source.task_context_root,
			".codewiki/roadmap/tasks",
			"Roadmap state should expose generated task context root",
		);
		assert.ok(
			roadmapFolderIndex.tasks?.["TASK-001"],
			"Index graph roadmap lens should expose task shards",
		);
		assert.ok(
			Array.isArray(roadmapState.views.open_task_ids) &&
				roadmapState.views.open_task_ids.length >= 1,
			"Roadmap state should expose open task ids",
		);
		assert.equal(
			roadmapState.tasks["TASK-001"].id,
			"TASK-001",
			"Roadmap state should carry task identifiers",
		);
		assert.equal(
			roadmapState.tasks["TASK-001"].status,
			"in_progress",
			"Resume should update canonical task status without raw event replay",
		);
		assert.ok(
			roadmapState.tasks["TASK-001"].title,
			"Roadmap state should carry task display data",
		);
		assert.ok(
			Array.isArray(roadmapState.tasks["TASK-001"].goal.verification),
			"Roadmap state should carry task goal metadata",
		);
		assert.ok(
			!("phase" in roadmapState.tasks["TASK-001"].loop),
			"Roadmap state should not expose task phases",
		);
		assert.equal(
			statusState.version,
			1,
			"Status state should expose v1 contract",
		);
		assert.equal(
			statusState.health.color,
			expectedHealthColor,
			"Status state should carry deterministic health color",
		);
		assert.ok(
			Array.isArray(statusState.specs) && statusState.specs.length >= 5,
			"Status state should carry derived spec rows",
		);
		assert.ok(
			Array.isArray(statusState.wiki?.rows) &&
				statusState.wiki.rows.length >= 5,
			"Status state should expose wiki rows for the primary status tab",
		);
		assert.ok(
			Array.isArray(statusState.wiki?.sections) &&
				statusState.wiki.sections.some(
					(section) => section.label === "Product",
				) &&
				statusState.wiki.sections.some(
					(section) => section.label === "System",
				) &&
				statusState.wiki.sections.some(
					(section) => section.label === "Clients",
				),
			"Status state should expose Product/System/Clients wiki groups",
		);
		assert.ok(
			Array.isArray(statusState.roadmap?.in_progress_task_ids),
			"Status state should expose roadmap tab task ids",
		);
		assert.ok(
			Array.isArray(statusState.roadmap?.columns) &&
				statusState.roadmap.columns.some((column) => column.id === "todo") &&
				statusState.roadmap.columns.some(
					(column) => column.id === "implement",
				) &&
				statusState.roadmap.columns.some((column) => column.id === "done") &&
				!statusState.roadmap.columns.some((column) => column.id === "verify"),
			"Status state should expose unified canonical task-state columns",
		);
		assert.ok(
			Array.isArray(statusState.agents?.rows),
			"Status lens should expose agent rows collection",
		);
		assert.equal(
			statusState.channels?.add_label,
			"Add channel",
			"Status state should expose minimal channel-add affordance",
		);
		assert.ok(
			Array.isArray(statusState.channels?.rows) &&
				statusState.channels.rows.length === 0,
			"Status state should keep channels list minimal until user channels are added",
		);
		assert.ok(
			statusState.bars.spec_mapping.percent >= 60,
			`Smoke repo spec mapping coverage should be at least 60%, got ${statusState.bars.spec_mapping.percent}%`,
		);
		assert.ok(
			typeof statusState.next_step.command === "string" &&
				statusState.next_step.command.length > 0,
			"Status state should recommend a next step",
		);
		assert.equal(
			statusState.agency.summary.lane_count,
			3,
			"Status state should expose three agency lanes",
		);
		assert.equal(
			statusState.agency.summary.freshness_basis,
			"work-first",
			"Status state should describe agency freshness as work-first",
		);
		assert.deepEqual(
			statusState.agency.summary.high_cadence_lane_ids,
			["system_code"],
			"Status state should classify system↔code as high cadence",
		);
		assert.ok(
			statusState.agency.lanes.some(
				(lane) =>
					lane.id === "product_system" &&
					lane.recommendation.command === "/wiki-status",
			),
			"Status state should expose agency lane recommendations through wiki-status",
		);
		assert.ok(
			statusState.agency.lanes.some(
				(lane) =>
					lane.id === "system_code" &&
					lane.fallback_max_age_hours === 1 &&
					lane.triggers.includes("code_change:mapped"),
			),
			"Status state should expose work-triggered freshness metadata for agency lanes",
		);
		assert.equal(
			statusState.resume.source,
			"task",
			"Status state should expose deterministic resume source",
		);
		assert.match(
			statusState.resume.command,
			/^\/wiki-resume TASK-\d+$/,
			"Status state should expose deterministic resume command",
		);
		assert.equal(
			statusState.resume.task_id,
			"TASK-001",
			"Status state resume task should derive from canonical roadmap order without raw focus events",
		);
		assert.equal(
			statusState.roadmap.focused_task_id,
			"TASK-001",
			"Status roadmap focus should derive from canonical roadmap state",
		);
		assert.equal(
			statusState.resume.status,
			"in_progress",
			"Status state should expose deterministic task status",
		);
		assert.ok(
			typeof statusState.resume.verification === "string" &&
				statusState.resume.verification.length > 0,
			"Status state should expose a resume verification cue",
		);
		assert.match(
			String(statusState.resume.reason),
			/Roadmap task|already covers/i,
			"Status state should explain canonical roadmap selection",
		);
		assert.ok(
			typeof statusState.parallel.active_session_count === "number",
			"Status state should expose parallel-session count",
		);
		assert.ok(
			Array.isArray(statusState.parallel.collision_task_ids),
			"Status state should expose collision task ids array",
		);
		assert.ok(
			!JSON.stringify(roadmapJson).includes("Session links:"),
			"Roadmap JSON should not persist session linkage metadata",
		);
		assert.ok(
			statusNotifications.every(
				(entry) => !/Wiki: Smoke Wiki/.test(String(entry.message)),
			),
			"alt+w should prefer opening the panel over posting a long notify when custom UI is available",
		);
		assert.equal(
			typeof widgetState.content,
			"function",
			"status panel should render as a live top widget",
		);
		assert.ok(
			statusSummaries.some(
				(entry) =>
					entry.key === "codewiki-status" &&
					/[🟢🟡🔴]/u.test(String(entry.value)) &&
					/Smoke Wiki/.test(String(entry.value)),
			),
			"panel toggle should refresh the one-line status summary with repo name and traffic-light circle",
		);
		const widgetInstance = widgetState.content?.(
			{ terminal: { columns: 120, rows: 32 } },
			{
				fg: (_color, text) => text,
				bg: (_color, text) => text,
				bold: (text) => text,
			},
		);
		panelState.renderedLines = widgetInstance?.render(100) ?? [];
		panelLines = panelState.renderedLines ?? [];
		assert.match(
			panelLines[0] ?? "",
			/^┌/,
			"Status panel should render as a framed container",
		);
		assert.match(
			panelLines.join("\n"),
			/Smoke Wiki/,
			"Status panel header should contain the repo name",
		);
		assert.doesNotMatch(
			panelLines.join("\n"),
			/Smoke Wiki \|/,
			"Status panel header should not append traffic lights or extra metadata to the repo name",
		);
		assert.match(
			panelLines.join("\n"),
			/\[Status\].*Product.*System.*Board.*Graph/i,
			"Status panel should show simplified Status, Product, System, Board, and Graph tabs",
		);
		assert.doesNotMatch(
			panelLines.join("\n"),
			/Agents|Channels/i,
			"Status panel should not expose Agents or Channels tabs",
		);
		assert.match(
			panelLines.join("\n"),
			/Status[\s\S]*(🟢|🟡|🔴)[\s\S]*(GREEN|YELLOW|RED)[\s\S]*Checks:[\s\S]*Tasks:[\s\S]*Claims:[\s\S]*Next action/i,
			"Status tab should show compact metrics and next action",
		);
		panelState.terminalInput?.("\t");
		const widgetInstanceAfterProductTab = widgetState.content?.(
			{ terminal: { columns: 120, rows: 32 } },
			{
				fg: (_color, text) => text,
				bg: (_color, text) => text,
				bold: (text) => text,
			},
		);
		const productPanelLines = widgetInstanceAfterProductTab?.render(100) ?? [];
		assert.match(
			productPanelLines.join("\n"),
			/\[Product\]/i,
			"Tab should advance to Product",
		);
		assert.match(
			productPanelLines.join("\n"),
			/Maintainers[\s\S]*Agents[\s\S]*Intent/i,
			"Product tab should show maintainers, agents, and stories",
		);
		assert.doesNotMatch(
			productPanelLines.join("\n"),
			/(?<!Pi Extension |Agent Skills )Client/i,
			"Product tab should not show system client columns",
		);
		panelState.terminalInput?.("\t");
		const widgetInstanceAfterSystemTab = widgetState.content?.(
			{ terminal: { columns: 120, rows: 32 } },
			{
				fg: (_color, text) => text,
				bg: (_color, text) => text,
				bold: (text) => text,
			},
		);
		const systemPanelLines = widgetInstanceAfterSystemTab?.render(100) ?? [];
		assert.match(
			systemPanelLines.join("\n"),
			/\[System\][\s\S]*Diagrams[\s\S]*Components/i,
			"System tab should render diagram catalog and source-backed components",
		);
		panelState.terminalInput?.("\t");
		const widgetInstanceAfterBoardTab = widgetState.content?.(
			{ terminal: { columns: 120, rows: 32 } },
			{
				fg: (_color, text) => text,
				bg: (_color, text) => text,
				bold: (text) => text,
			},
		);
		const roadmapPanelLines = widgetInstanceAfterBoardTab?.render(100) ?? [];
		assert.match(
			roadmapPanelLines.join("\n"),
			/\[Board\]/i,
			"Roadmap tab should be labelled Board in the status panel UI",
		);
		assert.match(
			roadmapPanelLines.join("\n"),
			/Todo[\s\S]*Implement[\s\S]*Done/i,
			"Board tab should render canonical kanban task-state columns",
		);
		assert.doesNotMatch(
			roadmapPanelLines.join("\n"),
			/Research[\s\S]*Verify/i,
			"Board tab should not render deprecated workflow columns",
		);
		assert.match(
			roadmapPanelLines.join("\n"),
			/Smoke|Map code|Keep road/i,
			"Board tab should render task cards inside the kanban columns",
		);
		panelState.terminalInput?.("\r");
		const widgetInstanceAfterRoadmapDetail = widgetState.content?.(
			{ terminal: { columns: 120, rows: 32 } },
			{
				fg: (_color, text) => text,
				bg: (_color, text) => text,
				bold: (text) => text,
			},
		);
		const roadmapDetailLines = widgetInstanceAfterRoadmapDetail?.render(100) ?? [];
		assert.match(
			roadmapDetailLines.join("\n"),
			/Status: |Priority: /i,
			"Enter on a selected board task should open the reusable detail window",
		);
		assert.match(
			roadmapDetailLines.join("\n"),
			/Resume[\s\S]*Block/i,
			"Board detail window should expose task actions",
		);
		assert.ok(
			resumeNotifications.some((entry) => /queued in_progress for TASK-001/i.test(entry.message)),
			"wiki-resume should resume the deterministic task status from the focused roadmap task",
		);
		assert.ok(
			taskStatuses.some(
				(entry) =>
					entry.key === "codewiki-focus" &&
					/TASK-001 progress/i.test(String(entry.value)),
			),
			"wiki-resume should refresh task focus status",
		);
		assert.match(
			resumeBarrierNotifications.at(-1)?.message ?? "",
			/queued in_progress for TASK-002[\s\S]*User requested TASK-002 explicitly; artifact status allowed start/i,
			"wiki-resume should honor an explicit task when artifact status has no conflict",
		);
		assert.match(
			errorNotifications[0]?.message ?? "",
			/No repo-local wiki found from/,
			"Missing-target errors should explain why global commands could not pick a repo",
		);
		assert.match(
			errorNotifications[0]?.message ?? "",
			/loaded globally, but each run targets one repo-local wiki/i,
			"Missing-target errors should explain global-vs-local targeting",
		);
		assert.match(
			errorNotifications[0]?.message ?? "",
			/\/wiki-config \/path\/to\/repo/,
			"Missing-target errors should suggest passing an explicit repo path for configuration",
		);

		const archiveTaskResult = await taskTool.definition.execute(
			"task_create_archive_smoke",
			{
				repoPath: projectDir,
				action: "create",
				tasks: [
					{
						title: "Smoke archive retention task",
						priority: "low",
						kind: "testing",
						summary: "Exercise closed-task archival.",
						spec_paths: [".codewiki/kb/system/rules/overview.md"],
						code_paths: [],
						labels: ["archive-smoke"],
						goal: { verification: ["Close task and compact hot roadmap."] },
					},
				],
			},
			undefined,
			undefined,
			outsideToolCtx,
		);
		assert.match(
			archiveTaskResult.content?.[0]?.text ?? "",
			/TASK-\d+/i,
			"Archive smoke task should be created",
		);
		const archiveRoadmapBeforeClose = JSON.parse(
			readFileSync(resolve(projectDir, ".codewiki", "roadmap", "queue.json"), "utf8"),
		);
		const archiveTaskId = archiveRoadmapBeforeClose.order.find(
			(id) =>
				archiveRoadmapBeforeClose.tasks[id]?.title ===
				"Smoke archive retention task",
		);
		assert.ok(archiveTaskId, "Archive smoke task id missing before close");
		await taskTool.definition.execute(
			"task_archive_validation_smoke",
			{
				repoPath: projectDir,
				action: "update",
				taskId: archiveTaskId,
				evidence: { result: "pass", summary: "Archive smoke validated." },
			},
			undefined,
			undefined,
			outsideToolCtx,
		);
		const retentionConfigPath = resolve(projectDir, ".codewiki", "config.json");
		const retentionConfig = JSON.parse(
			readFileSync(retentionConfigPath, "utf8"),
		);
		retentionConfig.roadmap_retention = {
			closed_task_limit: 0,
			archive_path: ".codewiki/roadmap-archive.jsonl",
			compress_archive: false,
		};
		writeFileSync(
			retentionConfigPath,
			`${JSON.stringify(retentionConfig, null, 2)}\n`,
			"utf8",
		);
		await validationTool.definition.execute(
			"task-archive-close-validation-smoke",
			{
				repoPath: projectDir,
				profile: "task-close",
				task_id: archiveTaskId,
				verdict: "pass",
				rationale: "Archive smoke task has immutable close proof.",
				audit_refs: taskCloseAuditRefs,
				isolation: {
					role: "validator",
					fresh_context: true,
					clean: true,
					published_sha: "def5678",
					tree_sha: "abc1234",
				},
			},
			undefined,
			undefined,
			outsideToolCtx,
		);
		await taskTool.definition.execute(
			"task_archive_close_smoke",
			{
				repoPath: projectDir,
				action: "close",
				taskId: archiveTaskId,
				summary: "Close archive smoke task.",
				refresh: false,
			},
			undefined,
			undefined,
			outsideToolCtx,
		);
		const archiveRoadmapAfterClose = JSON.parse(
			readFileSync(resolve(projectDir, ".codewiki", "roadmap", "queue.json"), "utf8"),
		);
		const archiveText = readFileSync(
			resolve(projectDir, ".codewiki", "roadmap-archive.jsonl"),
			"utf8",
		);
		assert.ok(
			!archiveRoadmapAfterClose.tasks[archiveTaskId],
			"Closed task should leave hot roadmap when closed_task_limit is zero",
		);
		assert.match(
			archiveText,
			new RegExp(`"id":"${archiveTaskId}"`),
			"Closed task should be preserved losslessly in roadmap archive JSONL",
		);
		const checkpointResult = await taskTool.definition.execute(
			"task_checkpoint_smoke",
			{
				repoPath: projectDir,
				action: "checkpoint",
				summary: "v1.0.0-smoke",
			},
			undefined,
			undefined,
			outsideToolCtx,
		);
		assert.match(
			checkpointResult.content?.[0]?.text ?? "",
			/created release checkpoint/i,
			"Checkpoint action should report success",
		);
		const checkpointText = readFileSync(
			resolve(projectDir, ".codewiki", "roadmap", "release-checkpoints.jsonl"),
			"utf8",
		);
		assert.match(
			checkpointText,
			/v1\.0\.0-smoke/,
			"Checkpoint JSONL should contain the provided label",
		);
		const checkpointRecord = JSON.parse(checkpointText.trim().split(/\r?\n/).pop());
		assert.match(
			checkpointRecord.canonical_digest,
			/^sha256:[a-f0-9]{64}$/,
			"Checkpoint should record a deterministic canonical digest",
		);
		const clearArchiveResult = await taskTool.definition.execute(
			"task_clear_archive_smoke",
			{
				repoPath: projectDir,
				action: "clear-archive",
				summary: "Smoke test confirms explicit archive clearing.",
			},
			undefined,
			undefined,
			outsideToolCtx,
		);
		assert.match(
			clearArchiveResult.content?.[0]?.text ?? "",
			/cleared roadmap archive/i,
			"Archive clear action should report success",
		);
		assert.equal(
			readFileSync(
				resolve(projectDir, ".codewiki", "roadmap-archive.jsonl"),
				"utf8",
			),
			"",
			"Archive clear action should empty archive contents explicitly",
		);
	});
	console.log("✓ bootstrap smoke test passed (TypeScript rebuild)");

	console.log("All codewiki smoke tests passed.");
}

await main();
