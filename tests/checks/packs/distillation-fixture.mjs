import {
	createUserStandardDistillationRequest,
	createUserStandardSourceRequest,
	materializeUserStandardDistillationBundle,
	retrieveUserStandardSource,
	runUserStandardDistillation,
} from "../../../src/checks/packs/index.ts";
import {canonicalJsonDigest} from "../../../src/utils/canonical-json.ts";

const OBSERVED_AT = "2026-08-05T10:00:00.000Z";
const NOW = () => new Date(OBSERVED_AT);
const SOURCE = [
	"# Service policy",
	"Every changed public API names its accountable owner.",
	"Every released migration documents its rollback owner.",
	"Security defects receive earlier Decision attention than cosmetic requests.",
	"Legacy owner guidance is ambiguous and requires protected review.",
].join("\n");

export async function createCompletedDistillationFixture() {
	const sourceReceipt = await retrieveUserStandardSource({
		request: createUserStandardSourceRequest({
			kind: "inline",
			mediaType: "text/markdown",
			content: SOURCE,
		}),
		now: NOW,
	});
	const request = createUserStandardDistillationRequest({
		name: "Service ownership policy",
		sourceReceipt,
		defaultChecks: [],
		route: {
			id: "decision-reviewer",
			provider: "test-provider",
			model: "test-model",
			thinking: "high",
			timeoutMs: 60_000,
			configurationDigest: canonicalJsonDigest({route: "decision-reviewer"}),
		},
	});
	const response = {
		protocolId: "codewiki.user-standard-distillation",
		protocolVersion: "2.0.0",
		requestDigest: request.requestDigest,
		clauses: [
			{
				passage: "Every changed public API names its accountable owner.",
				explanation: "Project-specific organization policy requires one focused Check.",
				disposition: "custom_model",
				proposal: {
					checkTypeId: "organization_policy",
					name: "Public API owner",
					requirement: "Every changed public API names its accountable owner.",
					appliesWhen: {loops: ["decision"]},
				},
			},
			{
				passage: "Every released migration documents its rollback owner.",
				explanation: "Delivery policy needs a separate atomic Check.",
				disposition: "custom_model",
				proposal: {
					checkTypeId: "delivery_and_release",
					name: "Migration rollback owner",
					requirement: "Every released migration documents its rollback owner.",
					appliesWhen: {loops: ["implementation"], affectedLayers: ["data"]},
				},
			},
			{
				passage: "Security defects receive earlier Decision attention than cosmetic requests.",
				explanation: "This source passage defines triage behavior rather than pass/fail assurance.",
				disposition: "triage_preference",
				preference: "Prefer higher-severity and broader-exposure defects within the same safety tier.",
				dimensions: ["severity", "exposure", "age_fairness"],
			},
			{
				passage: "Legacy owner guidance is ambiguous and requires protected review.",
				explanation: "Ambiguous source meaning cannot become an active Check.",
				disposition: "unresolved",
				reason: "ambiguous",
				details: "Keep this clause visible until protected authority resolves it.",
			},
		],
	};
	const receipt = await runUserStandardDistillation({
		request,
		now: NOW,
		distiller: {
			binding: {
				id: "codewiki.test-distiller",
				version: "1.0.0",
				configurationDigest: canonicalJsonDigest({fixture: "distillation"}),
			},
			async execute() {
				return {status: "completed", response};
			},
		},
	});
	return {
		request,
		receipt,
		bundle: materializeUserStandardDistillationBundle(receipt),
	};
}

export async function createCompletedResourceDistillationFixture() {
	const passage = "Each Decision attempt uses no more than 1000 model tokens.";
	const sourceReceipt = await retrieveUserStandardSource({
		request: createUserStandardSourceRequest({
			kind: "inline",
			mediaType: "text/markdown",
			content: `# Runtime resource policy\n${passage}`,
		}),
		now: NOW,
	});
	const request = createUserStandardDistillationRequest({
		name: "Runtime resource policy",
		sourceReceipt,
		defaultChecks: [],
		route: {
			id: "decision-reviewer",
			provider: "test-provider",
			model: "test-model",
			thinking: "high",
			timeoutMs: 60_000,
			configurationDigest: canonicalJsonDigest({route: "decision-reviewer"}),
		},
	});
	const response = {
		protocolId: "codewiki.user-standard-distillation",
		protocolVersion: "2.0.0",
		requestDigest: request.requestDigest,
		clauses: [
			{
				passage,
				explanation: "Quantitative resource policy requires an approved deterministic template.",
				disposition: "custom_code",
				proposal: {
					checkTypeId: "organization_policy",
					name: "Decision model token limit",
					requirement: passage,
					repairGuidance: "Reduce bounded Decision context before retrying.",
					appliesWhen: {loops: ["decision"]},
					knowledgeRefs: ["knowledge:runtime-resource-policy"],
					templateIntent: "Measure exact model tokens for one Decision attempt.",
					requiredCapabilities: ["codewiki.model-usage-meter"],
				},
			},
		],
	};
	const receipt = await runUserStandardDistillation({
		request,
		now: NOW,
		distiller: {
			binding: {
				id: "codewiki.test-distiller",
				version: "1.0.0",
				configurationDigest: canonicalJsonDigest({fixture: "resource-distillation"}),
			},
			async execute() {
				return {status: "completed", response};
			},
		},
	});
	return {
		request,
		receipt,
		bundle: materializeUserStandardDistillationBundle(receipt),
	};
}
