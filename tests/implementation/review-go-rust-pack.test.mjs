import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { evaluateImplementationExit } from "../../src/implementation/loop.ts";
import {
	createGoVetReviewPack,
	createImplementationEvidenceReport,
	createRustCargoClippyReviewPack,
	detectGoReviewCommand,
	detectRustReviewCommand,
	parseCargoJsonDiagnostics,
	parseGoDiagnostics,
	parseRustTextDiagnostics,
	runLanguageReviewPacks,
} from "../../src/implementation/review/index.ts";
import { implementationQualityFields } from "../helpers/implementation-change.mjs";

const planningRef =
	"trace:TRACE-go-rust-review:planning:iteration:1#work:WU-go-rust";

describe("implementation Go and Rust review packs", () => {
	it("detects Go and Cargo commands", async () => {
		const root = await mkdtemp(join(tmpdir(), "codewiki-go-rust-detect-"));
		const previousPath = process.env.PATH;
		try {
			const bin = join(root, "bin");
			await mkdir(bin, { recursive: true });
			await writeFile(join(bin, "go"), "");
			await writeFile(join(bin, "cargo"), "");
			await writeFile(join(root, "Cargo.toml"), "[package]\nname='demo'\n");
			process.env.PATH = `${bin}:${previousPath || ""}`;

			const goTest = detectGoReviewCommand(root, "test");
			const goVet = detectGoReviewCommand(root, "vet");
			const cargoTest = detectRustReviewCommand(root, "test", ["src/lib.rs"]);
			const cargoClippy = detectRustReviewCommand(root, "clippy", [
				"src/lib.rs",
			]);

			assert.equal(goTest?.tool, "test");
			assert.deepEqual(goTest?.args, ["test", "./..."]);
			assert.equal(goVet?.tool, "vet");
			assert.deepEqual(goVet?.args, ["vet", "./..."]);
			assert.equal(cargoTest?.tool, "test");
			assert.deepEqual(cargoTest?.args, ["test", "--message-format=json"]);
			assert.equal(cargoClippy?.tool, "clippy");
			assert.deepEqual(cargoClippy?.args, [
				"clippy",
				"--all-targets",
				"--all-features",
				"--message-format=json",
			]);
		} finally {
			process.env.PATH = previousPath;
			await rm(root, { recursive: true, force: true });
		}
	});

	it("parses Go and Rust diagnostics", () => {
		const go = parseGoDiagnostics(
			"./main.go:10:2: undefined: missing\n    main_test.go:6: got wrong value",
			"go.test",
		);
		const rustJson = parseCargoJsonDiagnostics(
			JSON.stringify({
				reason: "compiler-message",
				message: {
					level: "error",
					message: "mismatched types",
					code: { code: "E0308" },
					spans: [
						{
							file_name: "src/lib.rs",
							line_start: 2,
							column_start: 5,
							line_end: 2,
							column_end: 9,
							is_primary: true,
						},
					],
				},
			}),
			"rust.cargo-test",
		);
		const rustText = parseRustTextDiagnostics(
			"error[E0425]: cannot find value `x` in this scope\n --> src/lib.rs:3:7\nthread 'tests::it_fails' panicked at src/lib.rs:8:3:",
			"rust.cargo-test",
		);

		assert.equal(go[0].path, "main.go");
		assert.equal(go[0].severity, "error");
		assert.equal(go[1].path, "main_test.go");
		assert.equal(rustJson[0].ruleId, "E0308");
		assert.equal(rustJson[0].range?.startLine, 2);
		assert.equal(rustText[0].ruleId, "E0425");
		assert.equal(rustText[1].message, "Rust test panic.");
	});

	it("runs Go and Rust packs through injected command runners", async () => {
		const root = await mkdtemp(join(tmpdir(), "codewiki-go-rust-run-"));
		try {
			const goPack = createGoVetReviewPack({
				detectCommand: () => ({
					tool: "vet",
					command: "go",
					args: ["vet", "./..."],
					description: "go vet",
				}),
				runCommand: async ({ command, args, cwd, timeoutMs }) => {
					assert.equal(command, "go");
					assert.deepEqual(args, ["vet", "./..."]);
					assert.equal(cwd, root);
					assert.equal(timeoutMs, 4444);
					return {
						exitCode: 1,
						stdout:
							"main.go:4:2: fmt.Println arg list ends with redundant newline",
						stderr: "",
						durationMs: 8,
					};
				},
			});
			const rustPack = createRustCargoClippyReviewPack({
				detectCommand: () => ({
					tool: "clippy",
					command: "cargo",
					args: ["clippy", "--message-format=json"],
					description: "cargo clippy",
				}),
				runCommand: async ({ command, args, cwd, timeoutMs }) => {
					assert.equal(command, "cargo");
					assert.deepEqual(args, ["clippy", "--message-format=json"]);
					assert.equal(cwd, root);
					assert.equal(timeoutMs, 4444);
					return {
						exitCode: 1,
						stdout: JSON.stringify({
							reason: "compiler-message",
							message: {
								level: "error",
								message: "clippy found an error",
								code: { code: "clippy::needless_return" },
								spans: [
									{
										file_name: "src/lib.rs",
										line_start: 5,
										column_start: 1,
										is_primary: true,
									},
								],
							},
						}),
						stderr: "",
						durationMs: 9,
					};
				},
			});

			const goReport = await runLanguageReviewPacks([goPack], {
				cwd: root,
				phase: "exit",
				changedPaths: ["main.go"],
				timeoutMs: 4444,
			});
			const rustReport = await runLanguageReviewPacks([rustPack], {
				cwd: root,
				phase: "exit",
				changedPaths: ["src/lib.rs"],
				timeoutMs: 4444,
			});

			assert.equal(goReport.checks[0].status, "fail");
			assert.equal(goReport.diagnostics[0].sourceId, "go.vet");
			assert.equal(rustReport.checks[0].status, "fail");
			assert.equal(rustReport.diagnostics[0].ruleId, "clippy::needless_return");
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("feeds Go and Rust diagnostics into Implementation exit review", async () => {
		const goReport = await runLanguageReviewPacks(
			[
				createGoVetReviewPack({
					detectCommand: () => ({
						tool: "vet",
						command: "go",
						args: ["vet", "./..."],
						description: "go vet",
					}),
					runCommand: async () => ({
						exitCode: 1,
						stdout: "main.go:4:2: unreachable code",
						stderr: "",
						durationMs: 4,
					}),
				}),
			],
			{
				cwd: process.cwd(),
				phase: "exit",
				changedPaths: ["main.go"],
			},
		);
		const rustReport = await runLanguageReviewPacks(
			[
				createRustCargoClippyReviewPack({
					detectCommand: () => ({
						tool: "clippy",
						command: "cargo",
						args: ["clippy", "--message-format=json"],
						description: "cargo clippy",
					}),
					runCommand: async () => ({
						exitCode: 1,
						stdout: JSON.stringify({
							reason: "compiler-message",
							message: {
								level: "error",
								message: "bad rust",
								code: { code: "E0001" },
								spans: [
									{
										file_name: "src/lib.rs",
										line_start: 1,
										column_start: 1,
										is_primary: true,
									},
								],
							},
						}),
						stderr: "",
						durationMs: 5,
					}),
				}),
			],
			{
				cwd: process.cwd(),
				phase: "exit",
				changedPaths: ["src/lib.rs"],
			},
		);
		const acceptanceReport = createImplementationEvidenceReport({
			phase: "exit",
			changedPaths: ["main.go", "src/lib.rs"],
			evidenceLinks: [
				{
					kind: "acceptance",
					targetRef: planningRef,
					criterionId: "AC-001",
					evidenceRefs: ["tests/implementation/review-go-rust-pack.test.mjs"],
				},
			],
		});

		const result = evaluateImplementationExit({
			planningRefs: [planningRef],
			acceptanceRequirements: [
				{
					planningRef,
					criterionId: "AC-001",
					text: "Go and Rust evidence is reviewed.",
				},
			],
			planningScopes: [
				{
					planningRef,
					workUnitId: "WU-go-rust",
					componentRefs: [],
					pathScopes: ["main.go", "main_test.go", "src/lib.rs", "tests/lib.rs"],
					verification: ["go test ./...", "cargo test"],
				},
			],
			changes: [
				{
					id: "IC-go-rust",
					planningRefs: [planningRef],
					codePaths: ["main.go", "src/lib.rs"],
					docPaths: [],
					testPaths: ["main_test.go", "tests/lib.rs"],
					publicationRefs: [],
					checks: ["go test ./...", "cargo test"],
					checkResults: [
						{
							command: "go test ./...",
							status: "pass",
							outputRef: "main_test.go",
						},
						{
							command: "cargo test",
							status: "pass",
							outputRef: "tests/lib.rs",
						},
					],
					acceptanceEvidenceItems: [
						{
							criterionId: "AC-001",
							summary: "Go and Rust evidence is reviewed.",
							evidenceRefs: [
								"tests/implementation/review-go-rust-pack.test.mjs",
							],
						},
					],
					contentProof: { workingTreeDigest: "sha256:go-rust" },
					...implementationQualityFields(),
				},
			],
			reviewEvidenceReports: [goReport, rustReport, acceptanceReport],
		});

		assert.equal(result.passed, false);
		assert.equal(
			result.issues.some(
				(issue) => issue.code === "review_blocking_diagnostic",
			),
			true,
		);
	});
});
