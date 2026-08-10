import assert from "node:assert/strict";
import {mkdtemp, mkdir, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {describe, it} from "node:test";

import {createProductionSecurityCollector} from "../../src/verification/security-collectors.ts";
import {runSecurityScannerSuite} from "../../src/verification/security-scanners.ts";
import {sha256Digest} from "../../src/utils/canonical-json.ts";

const digest = (character) => `sha256:${character.repeat(64)}`;
const gitObject = (character) => character.repeat(40);
const observedAt = "2099-01-01T12:00:00.000Z";
const advisoryObservedAt = "2099-01-01T11:00:00.000Z";
const advisoryValidUntil = "2099-01-01T13:00:00.000Z";

function subject() {
	return {
		changeRefs: ["change:production-scanner"],
		changeRevisionDigests: [digest("1")],
		candidateDigest: digest("2"),
		acceptanceRequirementIds: [],
		sourceTreeDigest: digest("3"),
	};
}

function source() {
	return {
		sourceSnapshotDigest: digest("6"),
		sourceTree: gitObject("a"),
		sourceTreeDigest: digest("3"),
		environmentDigest: digest("7"),
		sourceRefs: ["src/security/api.ts"],
		knowledgeRefs: ["kb:system/security"],
		ownershipRefs: ["kb:system/security#source"],
	};
}

function suiteInput(adapters, overrides = {}) {
	return {
		subject: subject(),
		...source(),
		surfaces: [],
		observedAt,
		sensitivity: "project",
		adapters,
		advisorySnapshots: [],
		...overrides,
	};
}

function sarif(tool, version, results = []) {
	return JSON.stringify({
		version: "2.1.0",
		$schema: "https://json.schemastore.org/sarif-2.1.0.json",
		runs: [{tool: {driver: {name: tool, version}}, results}],
	});
}

function commandResult(overrides = {}) {
	return {
		startedAt: "2026-08-10T11:59:00.000Z",
		completedAt: "2026-08-10T11:59:01.000Z",
		termination: "exited",
		exitCode: 0,
		stdout: "",
		stderr: "",
		outputExceeded: false,
		...overrides,
	};
}

async function fixture() {
	const root = await mkdtemp(join(tmpdir(), "codewiki-security-collector-"));
	const semgrepExecutable = join(root, "semgrep");
	const semgrepConfiguration = join(root, "semgrep.yml");
	const gitleaksExecutable = join(root, "gitleaks");
	const gitleaksRules = join(root, "gitleaks.toml");
	const gitleaksIgnore = join(root, ".gitleaksignore");
	const trivyExecutable = join(root, "trivy");
	const trivyCache = join(root, "trivy-cache");
	const trivyDatabase = join(trivyCache, "db", "trivy.db");
	await mkdir(join(trivyCache, "db"), {recursive: true});
	await writeFile(semgrepExecutable, "semgrep executable v1");
	await writeFile(semgrepConfiguration, "rules: []\n");
	await writeFile(gitleaksExecutable, "gitleaks executable v1");
	await writeFile(gitleaksRules, "title = \"CodeWiki rules\"\n");
	await writeFile(gitleaksIgnore, "# CodeWiki fixed ignore policy\n");
	await writeFile(trivyExecutable, "trivy executable v1");
	await writeFile(trivyDatabase, "trivy database snapshot v1");
	return {
		root,
		semgrepExecutable,
		semgrepConfiguration,
		gitleaksExecutable,
		gitleaksRules,
		gitleaksIgnore,
		trivyExecutable,
		trivyCache,
		trivyDatabase,
		semgrepExecutableDigest: sha256Digest("semgrep executable v1"),
		semgrepConfigurationDigest: sha256Digest("rules: []\n"),
		gitleaksExecutableDigest: sha256Digest("gitleaks executable v1"),
		gitleaksRulesDigest: sha256Digest("title = \"CodeWiki rules\"\n"),
		gitleaksIgnoreDigest: sha256Digest("# CodeWiki fixed ignore policy\n"),
		trivyExecutableDigest: sha256Digest("trivy executable v1"),
		trivyDatabaseDigest: sha256Digest("trivy database snapshot v1"),
	};
}

describe("production security collectors", () => {
	it("runs fixed Semgrep SARIF collection and emits sanitized scanner Evidence", async () => {
		const files = await fixture();
		try {
			const commands = [];
			const commandRunner = async (command) => {
				commands.push(command);
				if (command.args.includes("--version")) {
					return commandResult({stdout: "1.99.0\n"});
				}
				return commandResult({
					stdout: sarif("semgrep", "1.99.0", [
						{
							ruleId: "typescript.lang.security.audit.example",
							level: "error",
							message: {text: "private raw finding detail"},
							locations: [
								{physicalLocation: {artifactLocation: {uri: "src/security/api.ts"}, region: {startLine: 7}}},
							],
						},
					]),
				});
			};
			const collector = createProductionSecurityCollector({
				profile: "semgrep_sarif",
				repoRoot: files.root,
				executablePath: files.semgrepExecutable,
				executableDigest: files.semgrepExecutableDigest,
				scannerVersion: "1.99.0",
				source: source(),
				configurationPath: files.semgrepConfiguration,
				configurationDigest: files.semgrepConfigurationDigest,
				commandRunner,
			});

			const result = await runSecurityScannerSuite(
				suiteInput([collector.adapter]),
			);

			assert.equal(collector.identity.grantsResult, false);
			assert.equal(result.status, "failed");
			assert.equal(result.runs[0]?.findingCount, 1);
			assert.equal(result.intakeMaterials.length, 1);
			assert.equal(result.evidenceRecords.length, 2);
			assert.doesNotMatch(JSON.stringify(result), /private raw finding detail/);
			assert.equal(commands.length, 2);
			assert.deepEqual(commands[0].args, ["--version"]);
			assert.deepEqual(commands[1].args, [
				"scan",
				"--config",
				files.semgrepConfiguration,
				"--sarif",
				"--metrics=off",
				"--disable-version-check",
				"--no-autofix",
				"--timeout",
				"30",
				files.root,
			]);
			assert.deepEqual(commands[1].environment, {
				CI: "1",
				NO_COLOR: "1",
				SEMGREP_SEND_METRICS: "off",
				TRIVY_DISABLE_VEX_NOTICE: "true",
			});
			assert.equal(commands[1].cwd, files.root);
		} finally {
			await rm(files.root, {recursive: true, force: true});
		}
	});

	it("runs fixed Gitleaks directory SARIF with exact rules and ignore policy", async () => {
		const files = await fixture();
		try {
			const semgrepRunner = async (command) =>
				command.args.includes("--version")
					? commandResult({stdout: "1.99.0\n"})
					: commandResult({stdout: sarif("semgrep", "1.99.0")});
			const gitleaksCommands = [];
			const gitleaksRunner = async (command) => {
				gitleaksCommands.push(command);
				if (command.args.includes("version")) {
					return commandResult({stdout: "8.30.0\n"});
				}
				return commandResult({
					stdout: sarif("gitleaks", "v8.30.0", [
						{
							ruleId: "generic-api-key",
							level: "error",
							message: {text: "raw credential value must not escape"},
							locations: [
								{physicalLocation: {artifactLocation: {uri: "src/security/api.ts"}}},
							],
						},
					]),
				});
			};
			const semgrep = createProductionSecurityCollector({
				profile: "semgrep_sarif",
				repoRoot: files.root,
				executablePath: files.semgrepExecutable,
				executableDigest: files.semgrepExecutableDigest,
				scannerVersion: "1.99.0",
				source: source(),
				configurationPath: files.semgrepConfiguration,
				configurationDigest: files.semgrepConfigurationDigest,
				commandRunner: semgrepRunner,
			});
			const gitleaks = createProductionSecurityCollector({
				profile: "gitleaks_directory_sarif",
				repoRoot: files.root,
				executablePath: files.gitleaksExecutable,
				executableDigest: files.gitleaksExecutableDigest,
				scannerVersion: "8.30.0",
				source: source(),
				rulesPath: files.gitleaksRules,
				rulesDigest: files.gitleaksRulesDigest,
				ignorePath: files.gitleaksIgnore,
				ignoreDigest: files.gitleaksIgnoreDigest,
				commandRunner: gitleaksRunner,
			});
			const result = await runSecurityScannerSuite(
				suiteInput([semgrep.adapter, gitleaks.adapter], {
					surfaces: ["credentials_secrets"],
				}),
			);

			assert.equal(gitleaks.identity.protocol.version, "2.0.0");
			assert.equal(gitleaks.identity.scannerType, "secret_detection");
			assert.equal(gitleaks.identity.rulesDigest, files.gitleaksRulesDigest);
			assert.equal(gitleaks.identity.ignoreDigest, files.gitleaksIgnoreDigest);
			assert.equal(result.status, "failed");
			assert.deepEqual(result.requiredScannerTypes, [
				"static_analysis",
				"secret_detection",
			]);
			assert.equal(result.intakeMaterials.length, 1);
			assert.equal(
				result.intakeMaterials[0].content.claimedSecurity.classification,
				"secret_exposure",
			);
			assert.doesNotMatch(JSON.stringify(result), /raw credential value/);
			assert.deepEqual(gitleaksCommands[0].args, ["version"]);
			assert.deepEqual(gitleaksCommands[1].args, [
				"dir",
				"--config",
				files.gitleaksRules,
				"--gitleaks-ignore-path",
				files.gitleaksIgnore,
				"--report-format",
				"sarif",
				"--report-path",
				"-",
				"--exit-code",
				"0",
				"--no-banner",
				"--no-color",
				"--redact=100",
				"--max-archive-depth",
				"0",
				"--max-decode-depth",
				"0",
				".",
			]);
			assert.equal(gitleaksCommands[1].cwd, files.root);
		} finally {
			await rm(files.root, {recursive: true, force: true});
		}
	});

	it("runs Trivy with an exact offline advisory database and no update path", async () => {
		const files = await fixture();
		try {
			const semgrepRunner = async (command) =>
				command.args.includes("--version")
					? commandResult({stdout: "1.99.0\n"})
					: commandResult({stdout: sarif("semgrep", "1.99.0")});
			const trivyCommands = [];
			const trivyRunner = async (command) => {
				trivyCommands.push(command);
				return command.args.includes("--version")
					? commandResult({stdout: "Version: 0.69.3\n"})
					: commandResult({stdout: sarif("Trivy", "0.69.3")});
			};
			const semgrep = createProductionSecurityCollector({
				profile: "semgrep_sarif",
				repoRoot: files.root,
				executablePath: files.semgrepExecutable,
				executableDigest: files.semgrepExecutableDigest,
				scannerVersion: "1.99.0",
				source: source(),
				configurationPath: files.semgrepConfiguration,
				configurationDigest: files.semgrepConfigurationDigest,
				commandRunner: semgrepRunner,
			});
			const trivy = createProductionSecurityCollector({
				profile: "trivy_filesystem_sarif",
				repoRoot: files.root,
				executablePath: files.trivyExecutable,
				executableDigest: files.trivyExecutableDigest,
				scannerVersion: "0.69.3",
				source: source(),
				cacheDirectory: files.trivyCache,
				databasePath: files.trivyDatabase,
				databaseDigest: files.trivyDatabaseDigest,
				commandRunner: trivyRunner,
			});
			const result = await runSecurityScannerSuite(
				suiteInput([semgrep.adapter, trivy.adapter], {
					surfaces: ["dependency_supply_chain"],
					advisorySnapshots: [
						{
							scannerType: "dependency_advisory",
							snapshotDigest: files.trivyDatabaseDigest,
							observedAt: advisoryObservedAt,
							validUntil: advisoryValidUntil,
							sourceRefs: ["trivy-db:local:exact"],
						},
					],
				}),
			);

			assert.equal(result.status, "passed");
			assert.deepEqual(result.requiredScannerTypes, [
				"static_analysis",
				"dependency_advisory",
			]);
			assert.equal(trivyCommands.length, 2);
			assert.deepEqual(trivyCommands[1].args, [
				"fs",
				"--scanners",
				"vuln",
				"--format",
				"sarif",
				"--exit-code",
				"0",
				"--offline-scan",
				"--skip-db-update",
				"--skip-java-db-update",
				"--cache-dir",
				files.trivyCache,
				"--no-progress",
				files.root,
			]);
			assert.equal(trivy.identity.databaseDigest, files.trivyDatabaseDigest);
		} finally {
			await rm(files.root, {recursive: true, force: true});
		}
	});

	it("returns unavailable Evidence without invocation when bound files drift", async () => {
		const files = await fixture();
		try {
			let calls = 0;
			const collector = createProductionSecurityCollector({
				profile: "semgrep_sarif",
				repoRoot: files.root,
				executablePath: files.semgrepExecutable,
				executableDigest: files.semgrepExecutableDigest,
				scannerVersion: "1.99.0",
				source: source(),
				configurationPath: files.semgrepConfiguration,
				configurationDigest: files.semgrepConfigurationDigest,
				commandRunner: async () => {
					calls += 1;
					return commandResult();
				},
			});
			await writeFile(files.semgrepExecutable, "drifted executable");

			const result = await runSecurityScannerSuite(
				suiteInput([collector.adapter]),
			);

			assert.equal(result.status, "indeterminate");
			assert.equal(result.runs[0]?.status, "indeterminate");
			assert.equal(result.evidenceRecords[0]?.coverage, "unknown");
			assert.equal(calls, 0);
			assert.match(
				result.runs[0]?.limitations.join("\n") ?? "",
				/executable identity changed/,
			);
		} finally {
			await rm(files.root, {recursive: true, force: true});
		}
	});

	it("rejects bound-file mutation during scanner execution", async () => {
		const files = await fixture();
		try {
			let calls = 0;
			const collector = createProductionSecurityCollector({
				profile: "semgrep_sarif",
				repoRoot: files.root,
				executablePath: files.semgrepExecutable,
				executableDigest: files.semgrepExecutableDigest,
				scannerVersion: "1.99.0",
				source: source(),
				configurationPath: files.semgrepConfiguration,
				configurationDigest: files.semgrepConfigurationDigest,
				commandRunner: async (command) => {
					calls += 1;
					if (command.args.includes("--version")) {
						return commandResult({stdout: "1.99.0\n"});
					}
					await writeFile(files.semgrepConfiguration, "drifted during execution\n");
					return commandResult({stdout: sarif("semgrep", "1.99.0")});
				},
			});

			const result = await runSecurityScannerSuite(
				suiteInput([collector.adapter]),
			);

			assert.equal(result.status, "indeterminate");
			assert.equal(calls, 2);
			assert.match(
				result.runs[0]?.limitations.join("\n") ?? "",
				/configuration identity changed/,
			);
		} finally {
			await rm(files.root, {recursive: true, force: true});
		}
	});

	it("rejects open command and path configuration fields", async () => {
		const files = await fixture();
		try {
			assert.throws(
				() =>
					createProductionSecurityCollector({
						profile: "semgrep_sarif",
						repoRoot: files.root,
						executablePath: files.semgrepExecutable,
						executableDigest: files.semgrepExecutableDigest,
						scannerVersion: "1.99.0",
						source: source(),
						configurationPath: files.semgrepConfiguration,
						configurationDigest: files.semgrepConfigurationDigest,
						args: ["--arbitrary"],
					}),
				/unsupported field args/,
			);
			assert.throws(
				() =>
					createProductionSecurityCollector({
						profile: "semgrep_sarif",
						repoRoot: ".",
						executablePath: files.semgrepExecutable,
						executableDigest: files.semgrepExecutableDigest,
						scannerVersion: "1.99.0",
						source: source(),
						configurationPath: files.semgrepConfiguration,
						configurationDigest: files.semgrepConfigurationDigest,
					}),
				/repoRoot must be absolute/,
			);
		} finally {
			await rm(files.root, {recursive: true, force: true});
		}
	});
});
