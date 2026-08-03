import assert from "node:assert/strict";
import {describe, it} from "node:test";

import {
	PACT_EVIDENCE_ADAPTER_PROTOCOL,
	ingestPactV4JsonEvidence,
} from "../../src/evidence/adapters/pact.ts";
import {
	OPENAPI_EVIDENCE_ADAPTER_PROTOCOL,
	ingestOpenApiEvidence,
} from "../../src/evidence/adapters/openapi.ts";
import {materializeEvidenceRecord} from "../../src/evidence/materialize.ts";

const sourceSnapshotDigest = digest("1");
const scopeDigest = digest("2");
const candidateDigest = digest("3");
const revisionDigest = digest("4");
const sourceTreeDigest = digest("5");
const execution = Object.freeze({
	adapterId: "codewiki.contract.collector",
	adapterVersion: "1.0.0",
	requestDigest: digest("6"),
	invocationDigest: digest("7"),
	environmentDigest: digest("8"),
	configurationDigest: digest("9"),
	termination: "exited",
	exitCode: 0,
	durationMs: 27,
});

function input(bytes, ref, overrides = {}) {
	return {
		artifact: {bytes, ref},
		sourceSnapshotDigest,
		scopeDigest,
		sourcePaths: ["contracts/api.yaml"],
		requiredIdentityDigests: [],
		ownershipRefs: ["owner:api"],
		tool: {name: "contract-fixture", version: "1.0.0"},
		execution,
		provenanceRefs: ["contract-run:fixture/current"],
		...overrides,
	};
}

function pact(overrides = {}) {
	return {
		consumer: {name: "private-consumer"},
		provider: {name: "private-provider"},
		interactions: [
			{
				type: "Synchronous/HTTP",
				description: "private fetch interaction",
				key: "http-1",
				providerStates: [{name: "private state", params: {account: "secret-account"}}],
				request: {method: "GET", path: "/private/items"},
				response: {status: 200, body: {content: "private-value"}},
				matchingRules: {body: {}},
			},
			{
				type: "Asynchronous/Messages",
				description: "private message interaction",
				key: "message-1",
				pending: true,
				contents: {contentType: "application/json", content: {token: "private"}},
				pluginConfiguration: {csv: {version: "1"}},
			},
		],
		metadata: {pactSpecification: {version: "4.0"}},
		...overrides,
	};
}

function openapi(overrides = {}) {
	return {
		openapi: "3.1.1",
		info: {title: "private API", version: "1.0.0"},
		servers: [{url: "https://private.example.invalid"}],
		paths: {
			"/private/items": {
				get: {
					operationId: "listPrivateItems",
					responses: {
						"200": {
							description: "ok",
							content: {
								"application/json": {
									schema: {$ref: "#/components/schemas/PrivateItem"},
								},
							},
						},
					},
					callbacks: {
						onChange: {
							"{$request.body#/callbackUrl}": {
								post: {
									operationId: "privateChangeCallback",
									responses: {"204": {description: "accepted"}},
								},
							},
						},
					},
				},
			},
		},
		webhooks: {
			privateEvent: {
				post: {
					operationId: "privateWebhook",
					responses: {"202": {description: "accepted"}},
				},
			},
		},
		components: {
			schemas: {PrivateItem: {type: "object", properties: {secret: {type: "string"}}}},
			securitySchemes: {privateAuth: {type: "http", scheme: "bearer"}},
		},
		...overrides,
	};
}

function runtime(coverage) {
	return {
		subject: {
			changeRefs: ["TRACE-CHG-contract-adapters"],
			changeRevisionDigests: [revisionDigest],
			candidateDigest,
			acceptanceRequirementIds: [],
			sourceTreeDigest,
		},
		observedAt: "2026-08-06T11:00:00.000Z",
		producer: {kind: "external_service", id: "contract-collector", version: "1.0.0"},
		authority: "observed",
		coverage,
		sensitivity: "project",
	};
}

describe("Pact and OpenAPI contract Evidence adapters", () => {
	it("ingests Pact V4 contracts as content Evidence rather than verification Results", () => {
		const result = ingestPactV4JsonEvidence(
			input(JSON.stringify(pact()), "contract-artifact:pact/current.json"),
		);
		assert.deepEqual({...result.protocol}, PACT_EVIDENCE_ADAPTER_PROTOCOL);
		assert.equal(result.coverage, "complete");
		assert.equal(result.grantsResult, false);
		assert.equal(result.authorityCeiling, "observed");
		assert.equal(result.summary.profile, "Pact Specification 4.0 JSON");
		assert.equal(result.summary.interactionCount, 2);
		assert.equal(result.summary.synchronousHttpInteractionCount, 1);
		assert.equal(result.summary.asynchronousMessageInteractionCount, 1);
		assert.equal(result.summary.pendingInteractionCount, 1);
		assert.equal(result.summary.pluginInteractionCount, 1);
		assert.equal(result.summary.providerStateCount, 1);
		assert.equal(result.sourceObservation.kind, "source_observation");
		assert.equal(
			materializeEvidenceRecord(
				result.sourceObservation,
				runtime(result.coverage),
			).coverage,
			"complete",
		);
		const serialized = JSON.stringify(result);
		assert.equal(serialized.includes("private-consumer"), false);
		assert.equal(serialized.includes("private-value"), false);
		assert.equal("result" in result, false);
		assert.equal("verdict" in result, false);
		assert.equal(
			ingestPactV4JsonEvidence(
				input(JSON.stringify(pact()), "contract-artifact:pact/current.json"),
			).receiptDigest,
			result.receiptDigest,
		);
	});

	it("ingests bounded OpenAPI JSON and YAML operations without resolving external refs", () => {
		const json = ingestOpenApiEvidence(
			input(JSON.stringify(openapi()), "contract-artifact:openapi/current.json"),
		);
		assert.deepEqual({...json.protocol}, OPENAPI_EVIDENCE_ADAPTER_PROTOCOL);
		assert.equal(json.coverage, "complete");
		assert.equal(json.summary.profile, "OpenAPI 3.1.1");
		assert.equal(json.summary.encoding, "json");
		assert.equal(json.summary.operationCount, 3);
		assert.equal(json.summary.webhookOperationCount, 1);
		assert.equal(json.summary.callbackOperationCount, 1);
		assert.equal(json.summary.schemaCount, 1);
		assert.equal(json.summary.securitySchemeCount, 1);
		assert.equal(json.summary.externalReferenceCount, 0);
		assert.equal(json.artifact.mediaType, "application/vnd.oai.openapi+json");

		const yaml = `openapi: 3.0.4
info:
  title: Private YAML API
  version: 2.0.0
paths:
  /private/status:
    get:
      operationId: privateStatus
      responses:
        "200":
          description: ok
`;
		const yamlResult = ingestOpenApiEvidence(
			input(yaml, "contract-artifact:openapi/current.yaml"),
		);
		assert.equal(yamlResult.coverage, "complete");
		assert.equal(yamlResult.summary.profile, "OpenAPI 3.0.4");
		assert.equal(yamlResult.summary.encoding, "yaml");
		assert.equal(yamlResult.summary.operationCount, 1);
		assert.equal(yamlResult.artifact.mediaType, "application/vnd.oai.openapi");
		assert.equal(JSON.stringify(yamlResult).includes("Private YAML API"), false);

		const external = ingestOpenApiEvidence(
			input(
				JSON.stringify(
					openapi({
						paths: {
							"/external": {
								get: {
									operationId: "externalOperation",
									responses: {$ref: "https://example.invalid/responses.yaml"},
								},
							},
						},
					}),
				),
				"contract-artifact:openapi/external.json",
			),
		);
		assert.equal(external.coverage, "partial");
		assert.equal(external.summary.externalReferenceCount, 1);

		const dangling = ingestOpenApiEvidence(
			input(
				JSON.stringify(
					openapi({
						paths: {
							"/dangling": {
								get: {
									operationId: "danglingOperation",
									responses: {$ref: "#/components/responses/Missing"},
								},
							},
						},
					}),
				),
				"contract-artifact:openapi/dangling.json",
			),
		);
		assert.equal(dangling.coverage, "partial");
		assert.equal(dangling.summary.unresolvedInternalReferenceCount, 1);
	});

	it("preserves missing and unavailable contracts and rejects malformed profiles", () => {
		const missing = ingestPactV4JsonEvidence(
			input(JSON.stringify(pact()), "contract-artifact:pact/missing.json", {
				requiredIdentityDigests: [digest("f")],
			}),
		);
		assert.equal(missing.coverage, "partial");
		assert.equal(missing.summary.missingRequiredIdentityCount, 1);

		const unavailableExecution = {
			adapterId: execution.adapterId,
			adapterVersion: execution.adapterVersion,
			requestDigest: execution.requestDigest,
			invocationDigest: execution.invocationDigest,
			environmentDigest: execution.environmentDigest,
			configurationDigest: execution.configurationDigest,
			termination: "unavailable",
			durationMs: execution.durationMs,
		};
		const unavailable = ingestOpenApiEvidence(
			input(JSON.stringify(openapi()), "contract-artifact:openapi/unavailable.json", {
				execution: unavailableExecution,
			}),
		);
		assert.equal(unavailable.coverage, "unknown");

		assert.throws(
			() => ingestPactV4JsonEvidence({...input(JSON.stringify(pact()), "contract-artifact:pact/auth.json"), authority: "observed"}),
			/Pact ingestion received unsupported field authority/,
		);
		assert.throws(
			() =>
				ingestPactV4JsonEvidence(
					input(
						JSON.stringify(pact({metadata: {pactSpecification: {version: "3.0.0"}}})),
						"contract-artifact:pact/v3.json",
					),
				),
			/Pact specification version must be 4.0/,
		);
		assert.throws(
			() =>
				ingestPactV4JsonEvidence(
					input(
						JSON.stringify(
							pact({
								interactions: [
									pact().interactions[0],
									{...pact().interactions[0], key: "http-2"},
								],
							}),
						),
						"contract-artifact:pact/duplicate.json",
					),
				),
			/descriptions must be unique/,
		);
		assert.throws(
			() =>
				ingestOpenApiEvidence(
					input(
						JSON.stringify(openapi({openapi: "2.0"})),
						"contract-artifact:openapi/v2.json",
					),
				),
			/version must be supported 3.0.x or 3.1.x/,
		);
		assert.throws(
			() =>
				ingestOpenApiEvidence(
					input(
						`openapi: 3.1.1
info: &private
  title: Alias API
  version: 1
paths:
  /a:
    get:
      responses: {"200": {description: ok}}
x-copy: *private
`,
						"contract-artifact:openapi/alias.yaml",
					),
				),
			/cannot contain aliases, anchors, or tags|could not be parsed safely/,
		);
		const duplicateJson = JSON.stringify(openapi()).replace(
			'"openapi":"3.1.1"',
			'"openapi":"3.1.1","openapi":"3.1.1"',
		);
		assert.throws(
			() =>
				ingestOpenApiEvidence(
					input(duplicateJson, "contract-artifact:openapi/duplicate.json"),
				),
			/malformed or duplicate-key syntax/,
		);
	});
});

function digest(character) {
	return `sha256:${character.repeat(64)}`;
}
