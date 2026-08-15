import type {
	ChangeKind,
	ChangeRisk,
	ChangeScope,
	ChangeType,
} from "../changes/types.ts";
import {
	canonicalJsonDigest,
	type Sha256Digest,
} from "../utils/canonical-json.ts";

export const SECURITY_SURFACE_CLASSIFIER = Object.freeze({
	id: "codewiki.security-surface-classifier",
	version: "1.0.0",
});

export const SECURITY_SURFACES = [
	"authentication_authorization",
	"sensitive_data_privacy",
	"credentials_secrets",
	"network_public_api",
	"dependency_supply_chain",
	"parsing_deserialization",
	"command_process_execution",
	"filesystem",
	"cryptography",
	"persistence_migration",
	"infrastructure_configuration",
	"browser_trust_boundary",
] as const;

export type SecuritySurface = (typeof SECURITY_SURFACES)[number];

export interface SecuritySurfaceSignal {
	readonly ref: string;
	readonly value: string;
}

interface SecuritySurfaceClassifierInput {
	readonly changeId: string;
	readonly revision: number;
	readonly revisionDigest: Sha256Digest;
	readonly kind: ChangeKind;
	readonly type: ChangeType;
	readonly scope: ChangeScope;
	readonly risk: ChangeRisk;
	readonly affectedLayers: readonly string[];
	readonly targetRefs: readonly string[];
	readonly knowledgeRefs: readonly string[];
	readonly sourceRefs: readonly string[];
	readonly signals: readonly SecuritySurfaceSignal[];
}

export interface SecuritySurfaceFinding {
	readonly surface: SecuritySurface;
	readonly reasons: readonly string[];
}

export interface SecuritySurfaceClassification {
	readonly classifierId: typeof SECURITY_SURFACE_CLASSIFIER.id;
	readonly classifierVersion: typeof SECURITY_SURFACE_CLASSIFIER.version;
	readonly inputDigest: Sha256Digest;
	readonly classificationDigest: Sha256Digest;
	readonly changeId: string;
	readonly revision: number;
	readonly revisionDigest: Sha256Digest;
	readonly surfaces: readonly SecuritySurface[];
	readonly findings: readonly SecuritySurfaceFinding[];
	readonly unresolvedSignals: readonly string[];
	readonly coverage: {
		readonly revision: "complete";
		readonly knowledge: "refs_only";
		readonly source: "refs_only";
	};
}

interface SurfaceRule {
	readonly surface: SecuritySurface;
	readonly changeKinds?: readonly ChangeKind[];
	readonly changeTypes?: readonly ChangeType[];
	readonly affectedLayers?: readonly string[];
	readonly targetRefPatterns?: readonly RegExp[];
	readonly terms?: readonly {readonly id: string; readonly pattern: RegExp}[];
}

const SURFACE_RULES: readonly SurfaceRule[] = [
	{
		surface: "authentication_authorization",
		affectedLayers: ["auth", "authentication", "authorization", "identity", "security"],
		targetRefPatterns: [/\bauth(?:n|z)?\b/i, /\bidentity\b/i, /\bpermission/i],
		terms: terms({
			authentication: /\bauthentication\b|\bauthn\b|\blog[ -]?in\b/i,
			authorization: /\bauthori[sz]ation\b|\bauthz\b|\baccess control\b/i,
			permissions: /\bpermission(?:s)?\b|\brole[- ]based\b|\brbac\b|\bacl\b/i,
		}),
	},
	{
		surface: "sensitive_data_privacy",
		affectedLayers: ["privacy", "personal-data", "sensitive-data"],
		targetRefPatterns: [/\bprivacy\b/i, /\bpersonal[-_ ]?data\b/i],
		terms: terms({
			personal_data: /\bpersonal data\b|\bpersonally identifiable\b|\bpii\b/i,
			privacy: /\bprivacy\b|\bdata minimization\b|\bdata retention\b/i,
			sensitive_data: /\bsensitive data\b|\bconfidential data\b/i,
		}),
	},
	{
		surface: "credentials_secrets",
		affectedLayers: ["credentials", "secrets"],
		targetRefPatterns: [/\bsecret/i, /\bcredential/i, /\.env(?:\.|$)/i],
		terms: terms({
			credentials: /\bcredential(?:s)?\b|\bpassword(?:s)?\b/i,
			secrets: /\bsecret(?:s)?\b|\bapi key(?:s)?\b|\bprivate key(?:s)?\b/i,
			tokens: /\baccess token(?:s)?\b|\brefresh token(?:s)?\b/i,
		}),
	},
	{
		surface: "network_public_api",
		affectedLayers: ["api", "network", "http", "service"],
		targetRefPatterns: [/\bpublic[-_ ]?api\b/i, /\bopenapi\b/i, /\bwebhook/i, /\bnetwork\b/i],
		terms: terms({
			public_api: /\bpublic api\b|\bpublic interface\b/i,
			network: /\bnetwork\b|\bhttp(?:s)?\b|\bwebhook\b|\bsocket\b/i,
			endpoint: /\bendpoint(?:s)?\b|\bcors\b/i,
		}),
	},
	{
		surface: "dependency_supply_chain",
		changeTypes: ["dependency_change"],
		affectedLayers: ["dependency", "package", "supply-chain"],
		targetRefPatterns: [
			/(?:^|\/)(?:package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml)$/i,
			/(?:^|\/)(?:go\.sum|cargo\.lock|poetry\.lock|requirements[^/]*\.txt)$/i,
		],
		terms: terms({
			dependency: /\bdependenc(?:y|ies)\b|\blockfile\b/i,
			supply_chain: /\bsupply chain\b|\bsbom\b|\bpackage provenance\b/i,
		}),
	},
	{
		surface: "parsing_deserialization",
		affectedLayers: ["parser", "serialization"],
		targetRefPatterns: [/\bparser\b/i, /\bseriali[sz]/i],
		terms: terms({
			parsing: /\bpars(?:e|er|ing)\b|\buntrusted input\b/i,
			deserialization: /\bdeseriali[sz](?:e|ation|ing)\b|\bobject decoding\b/i,
			structured_input: /\bxml\b|\byaml\b|\barchive extraction\b/i,
		}),
	},
	{
		surface: "command_process_execution",
		affectedLayers: ["process", "shell", "command-execution"],
		targetRefPatterns: [/\bsubprocess\b/i, /\bcommand\b/i, /\bshell\b/i],
		terms: terms({
			command_execution: /\bcommand execution\b|\bcommand injection\b/i,
			process_execution: /\bprocess execution\b|\bsubprocess\b|\bspawn(?:ed|ing)?\b/i,
			shell_execution: /\bshell command\b|\bshell execution\b/i,
		}),
	},
	{
		surface: "filesystem",
		affectedLayers: ["filesystem", "file-storage"],
		targetRefPatterns: [/\bfilesystem\b/i, /\bfile-storage\b/i],
		terms: terms({
			filesystem: /\bfile system\b|\bfilesystem\b/i,
			path_traversal: /\bpath traversal\b|\bsymlink\b/i,
			file_transfer: /\bfile upload\b|\bfile download\b/i,
		}),
	},
	{
		surface: "cryptography",
		affectedLayers: ["crypto", "cryptography"],
		targetRefPatterns: [/\bcrypto/i, /\bcertificate/i],
		terms: terms({
			cryptography: /\bcryptograph(?:y|ic)\b|\bencrypt(?:ion|ed)?\b|\bdecrypt/i,
			signature: /\bdigital signature\b|\bsigning key\b|\bcertificate\b/i,
		}),
	},
	{
		surface: "persistence_migration",
		changeKinds: ["migrate"],
		affectedLayers: ["data", "database", "storage", "persistence"],
		targetRefPatterns: [/\bmigration/i, /\bdatabase\b/i, /\bschema\b/i],
		terms: terms({
			persistence: /\bpersist(?:ence|ent)\b|\bdatabase\b|\bstorage\b/i,
			migration: /\bmigrat(?:e|ion|ing)\b|\bschema change\b/i,
			transaction: /\btransaction(?:al)?\b|\bdata integrity\b/i,
		}),
	},
	{
		surface: "infrastructure_configuration",
		affectedLayers: ["configuration", "infrastructure", "deployment", "container"],
		targetRefPatterns: [
			/(?:^|\/)(?:dockerfile|compose\.ya?ml)$/i,
			/\.tf$/i,
			/(?:^|\/)\.github\/workflows\//i,
		],
		terms: terms({
			infrastructure: /\binfrastructure\b|\binfrastructure as code\b|\biac\b/i,
			configuration: /\bsecurity configuration\b|\bconfiguration policy\b/i,
			container: /\bcontainer\b|\bdocker\b|\bkubernetes\b|\bterraform\b/i,
		}),
	},
	{
		surface: "browser_trust_boundary",
		affectedLayers: ["frontend", "ui", "web", "browser"],
		targetRefPatterns: [/\bbrowser\b/i, /\bfrontend\b/i, /\bui\b/i],
		terms: terms({
			browser: /\bbrowser\b|\bdom\b|\bclient-side\b/i,
			web_attack: /\bxss\b|\bcsrf\b|\bcontent security policy\b|\bcsp\b/i,
			browser_boundary: /\bcookie(?:s)?\b|\blocalstorage\b|\bpostmessage\b/i,
		}),
	},
];

export function classifySecuritySurfaces(
	input: SecuritySurfaceClassifierInput,
): SecuritySurfaceClassification {
	assertInput(input);
	const normalizedInput = normalizedClassifierInput(input);
	const reasons = new Map<SecuritySurface, Set<string>>();
	for (const rule of SURFACE_RULES) {
		const matched = matchedReasons(rule, normalizedInput);
		if (matched.length > 0) reasons.set(rule.surface, new Set(matched));
	}
	const findings = [...reasons]
		.map(([surface, values]) => ({
			surface,
			reasons: [...values].sort(compareText),
		}))
		.sort((left, right) => left.surface.localeCompare(right.surface));
	const surfaces = findings.map((finding) => finding.surface);
	const unresolvedSignals =
		input.type === "security_change" && surfaces.length === 0
			? ["security_change_without_specific_surface"]
			: [];
	const body = {
		classifierId: SECURITY_SURFACE_CLASSIFIER.id,
		classifierVersion: SECURITY_SURFACE_CLASSIFIER.version,
		inputDigest: canonicalJsonDigest(normalizedInput),
		changeId: input.changeId,
		revision: input.revision,
		revisionDigest: input.revisionDigest,
		surfaces,
		findings,
		unresolvedSignals,
		coverage: {
			revision: "complete" as const,
			knowledge: "refs_only" as const,
			source: "refs_only" as const,
		},
	};
	return Object.freeze({
		...body,
		classificationDigest: canonicalJsonDigest(body),
	});
}

export function assertSecuritySurfaceClassification(
	classification: SecuritySurfaceClassification,
): void {
	if (
		classification.classifierId !== SECURITY_SURFACE_CLASSIFIER.id ||
		classification.classifierVersion !== SECURITY_SURFACE_CLASSIFIER.version
	) {
		throw new Error("Security-surface classifier identity is invalid.");
	}
	const {classificationDigest, ...body} = classification;
	const expected = canonicalJsonDigest(body);
	if (classificationDigest !== expected) {
		throw new Error(
			`Security-surface classification digest mismatch: expected ${expected}.`,
		);
	}
	const surfaces = classification.findings.map((finding) => finding.surface);
	if (
		JSON.stringify(surfaces) !== JSON.stringify(classification.surfaces) ||
		new Set(surfaces).size !== surfaces.length ||
		classification.findings.some(
			(finding) =>
				!SECURITY_SURFACES.includes(finding.surface) ||
				finding.reasons.length === 0 ||
				new Set(finding.reasons).size !== finding.reasons.length,
		)
	) {
		throw new Error("Security-surface classification findings are invalid.");
	}
}

function normalizedClassifierInput(input: SecuritySurfaceClassifierInput) {
	return {
		changeId: input.changeId,
		revision: input.revision,
		revisionDigest: input.revisionDigest,
		kind: input.kind,
		type: input.type,
		scope: input.scope,
		risk: input.risk,
		affectedLayers: normalizedValues(input.affectedLayers),
		targetRefs: normalizedValues(input.targetRefs),
		knowledgeRefs: normalizedValues(input.knowledgeRefs),
		sourceRefs: normalizedValues(input.sourceRefs),
		signals: [...input.signals]
			.map((signal) => ({ref: signal.ref.trim(), value: signal.value.trim()}))
			.sort((left, right) =>
				left.ref === right.ref
					? left.value.localeCompare(right.value)
					: left.ref.localeCompare(right.ref),
			),
	};
}

function matchedReasons(
	rule: SurfaceRule,
	input: ReturnType<typeof normalizedClassifierInput>,
): string[] {
	const reasons: string[] = [];
	if (rule.changeKinds?.includes(input.kind)) reasons.push(`change-kind:${input.kind}`);
	if (rule.changeTypes?.includes(input.type)) reasons.push(`change-type:${input.type}`);
	for (const layer of input.affectedLayers) {
		if (rule.affectedLayers?.includes(layer)) reasons.push(`affected-layer:${layer}`);
	}
	for (const ref of [...input.targetRefs, ...input.knowledgeRefs, ...input.sourceRefs]) {
		if (rule.targetRefPatterns?.some((pattern) => pattern.test(ref))) {
			reasons.push(`project-ref:${ref}`);
		}
	}
	for (const signal of input.signals) {
		for (const term of rule.terms ?? []) {
			if (term.pattern.test(signal.value)) reasons.push(`semantic-term:${signal.ref}:${term.id}`);
		}
	}
	return [...new Set(reasons)].sort(compareText);
}

function terms(
	values: Readonly<Record<string, RegExp>>,
): readonly {readonly id: string; readonly pattern: RegExp}[] {
	return Object.entries(values).map(([id, pattern]) => ({id, pattern}));
}

function normalizedValues(values: readonly string[]): string[] {
	return [...new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean))].sort(
		compareText,
	);
}

function compareText(left: string, right: string): number {
	return left.localeCompare(right);
}

function assertInput(input: SecuritySurfaceClassifierInput): void {
	if (!input.changeId.trim() || !Number.isSafeInteger(input.revision) || input.revision < 1) {
		throw new Error("Security-surface Change identity is invalid.");
	}
	if (!/^sha256:[0-9a-f]{64}$/.test(input.revisionDigest)) {
		throw new Error("Security-surface revision digest is invalid.");
	}
	if (
		input.signals.some((signal) => !signal.ref.trim() || !signal.value.trim()) ||
		new Set(input.signals.map((signal) => signal.ref)).size !== input.signals.length
	) {
		throw new Error("Security-surface semantic signals are invalid.");
	}
}
