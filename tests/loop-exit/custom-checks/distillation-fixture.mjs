import {
	createUserStandardDistillationRequest,
	createUserStandardSourceRequest,
	materializeUserStandardDistillationBundle,
	retrieveUserStandardSource,
	runUserStandardDistillation,
} from "../../../src/loop-exit/custom-checks/index.ts";
import {canonicalJsonDigest} from "../../../src/utils/canonical-json.ts";

const OBSERVED_AT = "2026-08-05T10:00:00.000Z";
const NOW = () => new Date(OBSERVED_AT);
const SOURCE = [
	"# Service policy",
	"Every changed public API names its accountable owner.",
	"Every released migration documents its rollback owner.",
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
		protocolVersion: "1.0.0",
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
