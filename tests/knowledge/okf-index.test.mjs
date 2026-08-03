import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { describe, it } from "node:test";
import { parseOkfDocument } from "../../src/knowledge/okf-frontmatter.ts";
import {
	generateOkfDirectoryIndex,
	generateOkfDirectoryIndexes,
	generateOkfLog,
} from "../../src/knowledge/okf-index.ts";
import { validateOkfBundle } from "../../src/knowledge/okf-validation.ts";

function collectFiles(root) {
	const output = [];
	for (const name of readdirSync(root).sort()) {
		const path = `${root}/${name}`;
		if (statSync(path).isDirectory()) output.push(...collectFiles(path));
		else output.push(path);
	}
	return output;
}

function readKbBundle() {
	return collectFiles(".codewiki/kb")
		.filter((path) => path.endsWith(".md"))
		.map((path) => ({
			path: path.replace(/^\.codewiki\/kb\//, ""),
			content: readFileSync(path, "utf8"),
		}));
}

describe("OKF index and log navigation", () => {
	it("generates indexes from concept frontmatter descriptions", () => {
		const bundle = readKbBundle();
		const indexes = generateOkfDirectoryIndexes(bundle);
		const root = indexes.find((index) => index.path === "index.md");
		const product = indexes.find((index) => index.path === "product/index.md");
		const stories = indexes.find(
			(index) => index.path === "product/stories/index.md",
		);
		const system = indexes.find((index) => index.path === "system/index.md");
		const components = indexes.find(
			(index) => index.path === "system/components/index.md",
		);

		assert.equal(root.path, "index.md");
		assert.match(
			root.content,
			/^---\nokf_version: "0\.1"\n---\n# CodeWiki Knowledge Index/,
		);
		assert.match(
			root.content,
			/\* \[Lexicon\]\(lexicon\.md\) - This file is CodeWiki's active vocabulary contract\./,
		);
		assert.match(root.content, /\* \[Product\]\(product\/\) - 14 concepts/);
		assert.match(root.content, /\* \[System\]\(system\/\) - 39 concepts/);

		assert.equal(product.path, "product/index.md");
		assert.match(
			product.content,
			/\* \[Product\]\(overview\.md\) - CodeWiki is a project-scoped intent-to-production alignment runtime/,
		);
		assert.match(product.content, /\* \[Stories\]\(stories\/\) - 6 concepts/);
		assert.match(
			stories.content,
			/\* \[Enforce User Standards\]\(custom-checks\.md\) - As a maintainer, I want CodeWiki to distill source-backed User Standards/,
		);

		assert.equal(system.path, "system/index.md");
		assert.match(
			system.content,
			/\* \[Components\]\(components\/\) - 31 concepts/,
		);
		assert.match(system.content, /\* \[Diagrams\]\(diagrams\/\) - 0 concepts/);
		assert.match(
			components.content,
			/\* \[Change Intake and Backlog Triage\]\(change-intake\.md\) - Change intake converts bounded findings and suggestions/,
		);
		assert.match(
			components.content,
			/\* \[User Standards and Custom Checks\]\(custom-checks\.md\) - Users provide source-backed Standards/,
		);
		assert.match(
			components.content,
			/\* \[Evidence Records\]\(evidence\.md\) - Evidence Records give every Loop one immutable, typed, content-addressed way/,
		);
		assert.match(
			components.content,
			/\* \[Runtime\]\(runtime\.md\) - Runtime is CodeWiki's project-scoped authority and control plane/,
		);
	});

	it("keeps checked-in navigation files identical to generated output", () => {
		const bundle = readKbBundle();
		for (const index of generateOkfDirectoryIndexes(bundle)) {
			assert.equal(
				readFileSync(`.codewiki/kb/${index.path}`, "utf8"),
				index.content,
			);
		}
		assert.equal(
			readFileSync(".codewiki/kb/log.md", "utf8"),
			generateOkfLog({
				date: "2026-08-01",
				entries: [
					{
						kind: "Update",
						text: "Added `codewiki.standard-evidence-check-executor@1.0.0` and installed exact report-bound capabilities in native Loop Exit Runtime. Each capability binds one Loop/Check/version, every owned obligation, one normalized selector, adapter receipt, and materialized bundle; protected Resolved Exit Policy must bind the same selector. Runtime rechecks Candidate/source identity, produces immutable Evidence Records/resolutions, maps evaluator observations into boolean Code Check output, disables report-bound caching, and alone constructs Results. Duplicate Check capabilities or bundle assignment, partial obligation ownership, permissive obligations, non-Code Checks, cancellation, and drift fail closed. Check Catalog clean-cuts to `7.0.0` and standard external-command obligations require artifacts.",
					},
					{
						kind: "Update",
						text: "Added closed `codewiki.standard-evidence-check-evaluation@1.0.0`. Exact receipt/bundle/protocol/selector/obligation binding now derives bounded `satisfied | unsatisfied | indeterminate` observations for JUnit minimum tests, zero failures/errors, and maximum skips, LCOV/Cobertura line/branch/function basis-point thresholds, SARIF blocked levels, authenticated provider accepted conclusions, and minimum required identities in CycloneDX/SPDX/Pact/OpenAPI content. Evaluators reject obligations permitting partial Evidence, optional artifacts, non-Candidate subjects, or non-exact freshness, plus wrong adapter families, selector drift, receipt/bundle mismatch, and empty coverage denominators. Output has `grantsResult: false`; Runtime still creates Results. SBOM identity readiness grants no security/license claim, and contract identity readiness grants no verification/conformance claim.",
					},
					{
						kind: "Update",
						text: "Added closed `codewiki.evidence-adapter.materialization@1.0.0`. Runtime now verifies accepted core-adapter receipt integrity, exact supported protocol, artifact/source-subject binding, and fixed authority ceiling before materializing immutable command/source Evidence Records with protocol producer identity, observed or verified authority, exact source freshness, project sensitivity, and protocol/receipt/binding provenance. Exact accepted-protocol reduction reuses declarative Evidence obligations: complete observations become ready input even when factual tests or provider checks failed, while partial, unavailable, drifted, tampered, wrong-protocol, neutral, or duplicate Evidence remains missing or `indeterminate`. Every bundle has `grantsResult: false`; trusted Check code still owns semantic Results. SARIF, JUnit, LCOV, and Cobertura outputs now expose explicit source snapshot, authority ceiling, and no-Result fields, and resolution validation preserves eligible neutral Evidence as potentially relevant.",
					},
					{
						kind: "Update",
						text: "Added bounded `codewiki.evidence-adapter.cyclonedx@1.0.0`, `codewiki.evidence-adapter.spdx@1.0.0`, `codewiki.evidence-adapter.pact@1.0.0`, and `codewiki.evidence-adapter.openapi@1.0.0`. Exact source/scope/path/required-identity/tool/request/invocation/environment/configuration/execution bindings admit CycloneDX 1.7 JSON, SPDX 2.3 JSON, Pact 4.0 JSON, and OpenAPI 3.0/3.1 JSON or safe YAML through one 4 MiB, 64-depth, 100,000-node boundary. Digest-only summaries preserve bounded inventory, dependency, vulnerability, license, interaction, operation, callback, webhook, schema, security-scheme, and unresolved-reference facts. Missing identities, truncation, incomplete composition, external documents/refs, timeout, cancellation, and unavailability remain partial or unknown. Every adapter has an observed authority ceiling and `grantsResult: false`; Pact content is not verification, OpenAPI content is not conformance, and SBOM content is not security/license verdict. Verification Capability Matrix `2.0.0` now contains nine implemented core formats; Playwright maps through JUnit/UI capture and axe through SARIF. SARIF also rejects duplicate keys through the shared bounded JSON boundary.",
					},
					{
						kind: "Update",
						text: "Added bounded `codewiki.evidence-adapter.provider-check-receipt@1.0.0`. A trusted connector emits at most 64 KiB of digest-only canonical JSON bound to exact provider instance, repository, source snapshot, Git head, Check/configuration, authentication principal/credential identity, adapter, request, environment, and retrieval execution. Duplicate keys, credentials, authority/Result fields, drift, and contradictory lifecycle state fail closed. Completed provider success or failure is complete observation, pending is partial, and unavailable is unknown. Output is authenticated-retrieval `command_execution` material with `authorityCeiling: verified` and `grantsResult: false`; it grants no approval, Integration, delivery, release, or deployment authority. Verification matrix now reports five implemented standard adapters; real provider connectors remain host capabilities.",
					},
					{
						kind: "Update",
						text: "Added bounded `codewiki.evidence-adapter.lcov@1.0.0` and `codewiki.evidence-adapter.cobertura@1.0.0`. Exact Runtime-owned source snapshot, coverage scope, up to 255 required project paths, tool/version, request/invocation/environment/configuration, and execution bindings admit at most 4 MiB. Detailed line/branch/function hits are derived and cross-checked against LCOV or Cobertura declarations; private symbol identities remain digests. Unsafe/missing paths, contradictory totals, more than 2,048 unique files, non-exit, and unavailability remain partial or unknown. Output is canonical-receipted `command_execution` and `source_observation` material without threshold, authority, or Result input. Verification matrix now reports four implemented standard adapters.",
					},
					{
						kind: "Update",
						text: "Added bounded `codewiki.evidence-adapter.junit@1.0.0`. Exact Runtime-owned runner/version, source snapshot, test selection, expected count, request/invocation/environment/configuration, and execution bindings admit common `testsuites` or `testsuite` XML under 4 MiB, 32 nesting levels, 256 suites, 8,192 test cases, and 256 diagnostic refs. Audited parser/validator dependencies reject malformed or declaration-bearing XML; case identity and private failure details become digests. Count drift, unsafe paths, truncation, cancellation, timeout, and unavailability remain partial or unknown. Output is canonical-receipted `command_execution` material without authority or Result input. Verification matrix now reports two implemented standard adapters.",
					},
					{
						kind: "Update",
						text: "Added bounded `codewiki.evidence-adapter.sarif@1.0.0`. Exact Runtime-owned tool/version, source snapshot/scanned paths, adapter/request/invocation/environment/configuration/advisory, and execution bindings admit at most 4 MiB of SARIF 2.1 bytes, 32 runs, 8,192 findings, and 256 compact observations/refs. Raw bytes and finding messages are digested; unsafe absolute/URI locations are excluded with partial coverage; unavailable/non-exited execution cannot become complete. Output is only canonical-receipted `command_execution` and `source_observation` material with no subject/time/authority/verdict input. Verification matrix now reports SARIF implemented and all remaining standard adapters missing.",
					},
					{
						kind: "Update",
						text: "Added executable `codewiki.verification-capability-matrix@1.0.0`. Every Loop-qualified Default or active Custom Check now projects exact Catalog/config identity, execution status, Evidence obligations, trusted-producer/capability gaps, and potential standard formats into immutable digested rows. Canonical Evidence material admission is native, while SARIF 2.1, JUnit, LCOV, Cobertura, CycloneDX, SPDX, Playwright, axe, Pact, OpenAPI, and provider-check adapters remain explicitly `not_implemented`. Every format is Evidence-only with `grantsResult: false`; external tools never gain Result authority.",
					},
					{
						kind: "Update",
						text: "Added authenticated Decision-attention browsing through `/v1/runtime/decision-attention`, `ProjectCoordinatorRemoteClient`, `PiProjectServiceClientProvider`, read-only `wiki_attention`, and `/wiki-attention`. Omitted query input bootstraps one bounded `codewiki.backlog-triage-query@2.0.0` result from the current exact projection; supplied queries must bind that projection and reject drift or unsupported fields. Explicit user command `/wiki-select <change-id> --revision <revision-id> --projection <digest>` creates a fresh idempotency key and submits only the strict selection command. No model-callable selection tool or caller authority field exists; observers and missing native host capability remain fail-closed.",
					},
					{
						kind: "Update",
						text: "Added `codewiki.pi-native-decision-host@1.0.0` and `createPiNativeDecisionStartOptions()`. Given mandatory trusted repository identity, current project authority, replay policy, and Runtime continuation authority, the host composes exact Git selection admission, native Pi Candidate production, protected-config Exit Runtime construction, canonical continuation, and restart recovery. Only approved project-local Pi coordinator connections resolve to hashed stable principals and connection-specific authentication Evidence; optional project authorization may deny them. Pi daemon `nativeDecision` installs the bundle and rejects simultaneous raw `decisionStart`. Disposable two-clone proof covers denial, one producer run, complete canonical exit, daemon restart, and recovery without reinvocation. External user/provider identity remains separate.",
					},
					{
						kind: "Update",
						text: "Added `createPiSdkNativeDecisionCandidateProducer()` for the closed native Decision producer protocol. It rejects unsupported or authority-bearing request fields before session creation, validates exact revision identity and relationship shape, runs one isolated read-only Pi SDK session, accepts exactly one strict disposition/rationale proposal, enforces request/output/time bounds, and propagates coordinator cancellation through session abort and disposal. Default project-local Pi host composition now consumes this producer.",
					},
					{
						kind: "Update",
						text: "Added `createDecisionGitAdmission()` as the Runtime-owned selected-Decision context/appender boundary. It fresh-synchronizes Change state, loads and digest-checks protected config from the exact team source head, compiles Standard-derived triage policy, projects the Alignment Graph and a short-lived bound Backlog Triage context, and reuses that identity across authorization revalidation. Attempt append re-fetches state, checks expected WorkState and every team snapshot field, performs one expected-head Git push without blind retry, and verifies the exact canonical operation. Repository identity, current project authority, and replay policy remain trusted host inputs.",
					},
					{
						kind: "Update",
						text: "Added the host-configured native Decision attempt executor. It reloads fresh synchronized Git state, validates the exact authenticated active attempt/revision and protected-source/config-bound Exit Runtime before producer invocation, emits one bounded `codewiki.decision-candidate-production@1.0.0` request without authority or Evidence, materializes Candidate `2.0.0`, runs native Exit reduction, and commits supplied plus produced Evidence through attempt end under exact CAS. Canonical terminal attempt state recovers completion without producer/evaluator reinvocation. Pi daemon startup accepts an injected complete Decision-start bundle; default project-local approved-Pi authority and final host assembly are now installed when trusted project inputs are configured.",
					},
					{
						kind: "Update",
						text: "Clean-cut Decision Candidate schema to `2.0.0` over native ProjectWorkState. Runtime accepts only strict disposition/rationale proposal content, derives current revision, active canonical relationships, overlap accounting, and WorkState/Knowledge/source/config/policy bindings, and owns Candidate identity. Legacy ChangeRecord input, caller-supplied observed bases, copied validation/provenance/estimate fields, duplicate grounding refs, and unresolved summaries are removed without aliases. Decision checks and research Evidence now bind canonical revision and requirement identities directly; continuation admission reconstructs the Candidate and rejects stale or expanded artifacts before mutation. End-to-end selected-job host wiring remains pending.",
					},
					{
						kind: "Update",
						text: "Advanced Change Trace Protocol to `2.0.0` and clean-cut the skeletal revision shape. One immutable normalized revision now binds intent and alternatives, Runtime-owned source-family classification, impact, Knowledge propagation, observable outcomes, delivery constraints, source/proof Evidence expectations, safety/risk/failure/rollback semantics, acceptance requirements, and any optional defect profile. Native intake preserves exact source meaning, keeps unsupported assurance fields empty or unknown, and cannot promote source claims into revision risk. Triage, overlap, conflict serialization, deduplication, graph projection, replay, and frozen fixtures now consume the nested semantic contract directly; no legacy revision parser remains.",
					},
					{
						kind: "Update",
						text: "Simplified authenticated exact-revision Decision admission through `codewiki.decision-attention-selection@2.0.0`. One strict command carries a principal-scoped idempotency key, exact Change/revision identity, and the projection digest that already commits WorkState, triage Candidates, graph, protected config, and policy. Runtime resolves trusted caller authority, revalidates context after authorization, appends canonical `loop.attempt_started`, and uses that operation ID as the sole coordinator job key. The operation authority/base/revision/private-digest fields are the durable selection record; no separate receipt, receipt store, duplicate job identity, or broad selection adapter remains. Revision-derived conflict refs preserve serialization and canonical attempt state drives recovery. Pending Changes, generic triggers, and direct candidate submission remain unable to select Decision work; selection grants no disposition or Planning priority.",
					},
					{
						kind: "Update",
						text: "Added protected Standard-derived Backlog Triage policy through `codewiki.backlog-triage-policy@1.0.0`, Projection/Query Protocols `2.0.0`, User Standard Distillation Protocol `2.0.0`, protected configuration schema `3.0.0`, and guarded Mutation/Review/Acceptance Protocols `5.0.0`. Accepted `triage_preference` clauses now persist immutable distillation/Standard/source/passage-bound dimensions in protected config. Runtime derives fixed lexicographic precedence and comparator directions after safety tiers, merges repeated dimension refs without weight, preserves unknown values, and emits exact source-bearing ordering reasons without model-authored rank, score, queue state, Check outcome, or Planning priority.",
					},
					{
						kind: "Update",
						text: "Added approved-template Custom Code Checks through Custom Check schema `4.0.0`, Check Catalog `6.0.0`, and `codewiki.custom-code-template@1.0.0`. The only initial template is `resource_usage_limit`, with closed model-token, cost, latency, changed-file, and trace-byte metrics over exact Decision, Planning, and Implementation scopes. Runtime derives every template/configuration field, requires an exact `codewiki.custom-code-capability-snapshot@1.0.0` before activation, emits candidate-bound complete-window `resource_usage` Evidence under Evidence schema `1.2.0`, executes independent quantitative reduction, and exposes matching fail-closed preflight, meter, cancellation, and route-admission guards. Mutation, Policy Review, and Protected Acceptance Protocols `4.0.0` bind exact source proposal selection, separately approved typed template parameters, activation capability snapshot digest, protected configuration, and Standard/definition transitions. Models and users cannot supply executable code or verdict logic; production meter collectors and full Loop scheduling remain pending.",
					},
					{
						kind: "Update",
						text: "Added atomic distilled User Standard bundle mutation and advanced guarded Mutation, Policy Review, and Protected Acceptance Protocols to `3.0.0`. One authenticated command selects exact proposal ids from one completed distillation receipt, then adds the immutable Standard and selected draft Checks through complete-config CAS. Authorization, review, Git acceptance, and content-addressed receipts retain the full source-to-Check/unresolved bundle, selected ids, exact transitions, protected base, and before/after config. Standard-only bundles are valid; distillation and review grant no Check activation. Standard replacement/redistillation remains pending.",
					},
					{
						kind: "Update",
						text: "Added User Standard Source Retrieval Protocol `1.0.0` and User Standard Distillation Protocol `1.0.0`. Runtime now produces exact sanitized source receipts for bounded inline text or credential-isolated HTTPS adapters, preserves unavailable and malformed states, and runs one fresh tool-free Pi distiller against the exact source, kernel Default Checks, closed Check Types, route, and limits. Tamper-checked review bundles preserve exact passages, Default coverage, source-bound Custom Model proposals, inert Custom Code intents, quantitative guard requirements, triage preferences, and unresolved clauses without granting activation, Result, ordering, configuration, or Git authority. Atomic protected bundle mutation and production source connectors remain pending.",
					},
					{
						kind: "Update",
						text: "Added User Standard schema `1.0.0`, Custom Check schema `3.0.0`, protected configuration `2.0.0`, Check Catalog `5.0.0`, Decision Model Check Request Protocol `4.0.0`, and guarded policy protocols `2.0.0`. Immutable bounded inline/HTTPS snapshots now bind normalized source bytes, observed time, passage identities, Standard/definition/config digests, and independent model input. Source-unbound Custom Checks fail closed. Source retrieval/distillation, atomic Standard-plus-Check mutation, Custom Code templates/guards, and Standard-derived triage remain pending.",
					},
					{
						kind: "Decision",
						text: "Ratified source-backed User Standards as the only project-specific assurance input. CodeWiki provides Default Checks and distills accepted Standards into atomic Custom Model or approved-template Custom Code Checks; Default/Custom origin remains independent from Code/Model evaluation and Loop applicability. Company policy, execution guidance, quality criteria, and resource instructions are Standard content rather than separate artifact types. Hard resource Code Checks may derive matching Runtime guards, while non-pass/fail preferences influence protected deterministic Backlog Triage behavior. Direct source-unbound Custom Check authoring will be clean-cut away without a dual path. Backlog Triage only recommends attention; authenticated exact-revision user selection must start Decision, while Planning alone orders executable Work Items.",
					},
					{
						kind: "Update",
						text: "Added closed `codewiki.security-scanner-suite@1.0.0` and protected Decision Check `security_scanners_valid`; advanced Check Catalog to `4.0.0`. Deterministic surface selection, strict source/tree/environment/config/advisory requests, observed command/source Evidence, sanitized scanner finding intake, stale/unavailable `indeterminate` reduction, dependency-bound model input, exact persisted-Evidence replay, and external-state cache bypass are now executable. Production collectors, sealed calibration, deeper source/Knowledge analysis, and high/critical residual-risk authority remain pending.",
					},
					{
						kind: "Decision",
						text: "Deferred the complete Dashboard refactor until Runtime admission, native Loops, Evidence and assurance, archive/hydration, stable projections, and the legacy Trace clean cut are complete. Backend client contracts may proceed earlier, but visual patching of the legacy dashboard does not.",
					},
					{
						kind: "Update",
						text: "Added `codewiki.backlog-triage-projection@1.0.0` and bounded shared user/agent query `codewiki.backlog-triage-query@1.0.0`. Exact WorkState/Alignment Graph/config/policy bindings now produce provenance-bearing readiness, supported estimates, overlap, active-work blocking, freshness, Pareto, fairness, and explainable Decision-attention order without an overall score or Planning priority.",
					},
					{
						kind: "Update",
						text: "Added `codewiki.change-defect-profile@1.0.0` and Change Trace Protocol `1.2.0`. Exact revisions may preserve closed defect dimensions and qualified SARIF/CWE/CVE/GHSA/OSV/CVSS/KEV references with explicit Evidence authority while keeping unknown values, risk, and Planning priority separate.",
					},
					{
						kind: "Update",
						text: "Added closed user, provider-review, Worker Report, regression/scanner, delivery/outcome Evidence, and Knowledge-drift producers; advanced Change Intake Material to `1.1.0` and Change Trace to `1.3.0` for bounded claimed-security metadata. Pi process Worker Reports preserve bounded discovery proposals while Runtime alone adds exact Assignment, Claim, and tree bindings.",
					},
					{
						kind: "Update",
						text: "Replaced legacy `user | runtime | lab` feedback with strict `codewiki.change-intake-material@1.0.0` contracts under `src/changes/intake/**`. Eight closed source members carry bounded normalized semantic content and exact source-specific bindings without caller-owned Change identity, authority, time, priority, risk, route, or Check outcomes. Runtime now authenticates and correlates the exact material, records durable request/source/semantic fingerprints, deterministically routes current feedback or linked independent discovery, and verifies fresh expected-head Git acceptance.",
					},
					{
						kind: "Update",
						text: "Added provider-neutral protected Custom Check policy review and acceptance: exact authenticated review receipt, separate acceptance authority, repository/ref/config binding, deterministic config-only child commit, expected-head Git CAS, exact post-push verification, stale/drift rejection, and idempotent accepted-commit replay.",
					},
					{
						kind: "Update",
						text: "Added guarded Custom Check create/update/activate/disable commands with exact current/protected config CAS, protected Git-head loading, authenticated authority verification, idempotency, next-snapshot receipts, and protected-base anti-self-disable bindings; advanced the per-Check transport to Decision Model Check Request Protocol `3.0.0` and changed its machine id to `codewiki.decision.model-check-request`.",
					},
				],
			}),
		);
	});

	it("treats reserved navigation files as non-concepts", () => {
		const result = validateOkfBundle(readKbBundle());
		const documentsByPath = new Map(
			result.documents.map((document) => [document.path, document]),
		);

		assert.deepEqual(result.issues, []);
		assert.equal(result.conceptCount, 54);
		assert.equal(result.reservedCount, 10);
		assert.deepEqual(documentsByPath.get("index.md")?.frontmatter, {
			okf_version: "0.1",
		});
		for (const path of [
			"log.md",
			"product/index.md",
			"product/stories/index.md",
			"product/uis/index.md",
			"product/users/index.md",
			"system/index.md",
			"system/components/index.md",
			"system/flows/index.md",
			"system/diagrams/index.md",
		]) {
			const document = documentsByPath.get(path);
			assert.ok(document, `missing ${path}`);
			assert.equal(document.kind === "concept", false);
			assert.equal(document.frontmatter, undefined);
		}
		assert.equal(
			parseOkfDocument("system/index.md", "# System\n").kind,
			"index",
		);
	});

	it("uses progressive disclosure instead of linking every nested concept", () => {
		const bundle = readKbBundle();
		const root = generateOkfDirectoryIndex(bundle, {
			includeRootVersion: true,
		});
		const product = generateOkfDirectoryIndex(bundle, { directory: "product" });
		const system = generateOkfDirectoryIndex(bundle, { directory: "system" });

		assert.match(root.content, /\(product\/\)/);
		assert.match(root.content, /\(system\/\)/);
		assert.doesNotMatch(root.content, /system\/runtime\.md/);
		assert.doesNotMatch(root.content, /product\/stories\/intent\.md/);

		assert.match(product.content, /\(stories\/\)/);
		assert.doesNotMatch(product.content, /stories\/intent\.md/);

		assert.match(system.content, /\(components\/\)/);
		assert.match(system.content, /\(diagrams\/\)/);
		assert.doesNotMatch(system.content, /components\/runtime\.md/);
		const components = generateOkfDirectoryIndex(bundle, {
			directory: "system/components",
		});
		assert.match(components.content, /\(runtime\.md\)/);
	});
});
