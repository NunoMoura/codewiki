import {
	assertSha256Digest,
	canonicalJsonDigest,
	type Sha256Digest,
} from "../utils/canonical-json.ts";
import {assertExactKeys} from "../utils/json.ts";

export const REPAIR_PROFILE_PROTOCOL_VERSION = "1.0.0" as const;
export const MAX_REPAIR_PROFILES_PER_CHECK = 64;

const REPAIR_OUTCOMES = ["fail", "indeterminate"] as const;
const ROUTE_RECOMMENDATIONS = [
	"repair_candidate",
	"collect_context",
	"request_human_review",
] as const;
const SOURCE_LAYERS = [
	"global",
	"default_check",
	"custom_check",
	"project",
	"pack",
	"check",
] as const;
const MAX_OBJECTIVE_LENGTH = 1_000;
const MAX_TARGET_LENGTH = 240;
const MAX_GUIDANCE_ITEMS = 16;
const MAX_GUIDANCE_ITEM_LENGTH = 1_000;
const MAX_FINDING_CODE_LENGTH = 160;
const MAX_SOURCE_REF_LENGTH = 240;

export type RepairProfileOutcome = (typeof REPAIR_OUTCOMES)[number];
export type RepairRouteRecommendation = (typeof ROUTE_RECOMMENDATIONS)[number];
export type RepairProfileSourceLayer = (typeof SOURCE_LAYERS)[number];

export type RepairProfileMatch =
	| Readonly<{findingCode: string}>
	| Readonly<{outcome: RepairProfileOutcome}>;

export interface RepairProfileEntry {
	readonly match: RepairProfileMatch;
	readonly objective: string;
	readonly target: string;
	readonly actions: readonly string[];
	readonly prohibitedShortcuts: readonly string[];
	readonly requiredContext: readonly string[];
	readonly verification: readonly string[];
	readonly routeRecommendation?: RepairRouteRecommendation;
}

export interface RepairProfileSource {
	readonly layer: RepairProfileSourceLayer;
	readonly ref: string;
	readonly sourceDigest: Sha256Digest;
}

export interface ResolvedRepairProfile extends RepairProfileEntry {
	readonly protocolVersion: typeof REPAIR_PROFILE_PROTOCOL_VERSION;
	readonly variantId: string;
	readonly source: RepairProfileSource;
	readonly prohibitedShortcuts: readonly string[];
	readonly requiredContext: readonly string[];
	readonly profileDigest: Sha256Digest;
}

export interface RepairProfileLayer {
	readonly layer: RepairProfileSourceLayer;
	readonly ref: string;
	readonly profiles: readonly RepairProfileEntry[];
}

export interface MatchRepairProfilesInput {
	readonly profiles: readonly ResolvedRepairProfile[];
	readonly result: Readonly<{
		status: string;
		findings: readonly Readonly<{code?: string}>[];
	}>;
}

export function normalizeRepairProfileEntries(
	value: unknown,
	label = "Repair Profiles",
): readonly RepairProfileEntry[] {
	if (value === undefined) return Object.freeze([]);
	if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
	if (value.length > MAX_REPAIR_PROFILES_PER_CHECK) {
		throw new Error(
			`${label} cannot contain more than ${MAX_REPAIR_PROFILES_PER_CHECK} entries.`,
		);
	}
	const profiles = value.map((entry, index) =>
		normalizeRepairProfileEntry(entry, `${label}[${index}]`),
	);
	assertUniqueVariantIds(profiles.map((profile) => repairProfileVariantId(profile.match)), label);
	return Object.freeze(profiles.sort(compareProfileEntries));
}

export function resolveRepairProfiles(
	layers: readonly RepairProfileLayer[],
): readonly ResolvedRepairProfile[] {
	const resolved = new Map<string, ResolvedRepairProfile>();
	for (const input of layers) {
		const layer = enumValue(input.layer, SOURCE_LAYERS, "Repair Profile source layer");
		const ref = boundedText(input.ref, "Repair Profile source ref", MAX_SOURCE_REF_LENGTH);
		const profiles = normalizeRepairProfileEntries(
			input.profiles,
			`Repair Profiles from ${ref}`,
		);
		for (const profile of profiles) {
			const variantId = repairProfileVariantId(profile.match);
			const sourceDigest = canonicalJsonDigest(profile);
			const body = {
				protocolVersion: REPAIR_PROFILE_PROTOCOL_VERSION,
				variantId,
				...profile,
				source: {layer, ref, sourceDigest},
			};
			resolved.set(
				variantId,
				freezeRepairProfile({...body, profileDigest: canonicalJsonDigest(body)}),
			);
			assertMaximumResolvedProfiles(resolved.size);
		}
	}
	return Object.freeze([...resolved.values()].sort(compareResolvedProfiles));
}

export function overlayResolvedRepairProfiles(
	...sets: readonly (readonly ResolvedRepairProfile[])[]
): readonly ResolvedRepairProfile[] {
	const byVariant = new Map<string, ResolvedRepairProfile>();
	for (const set of sets) {
		assertResolvedRepairProfiles(set);
		for (const profile of set) byVariant.set(profile.variantId, profile);
		assertMaximumResolvedProfiles(byVariant.size);
	}
	return Object.freeze([...byVariant.values()].sort(compareResolvedProfiles));
}

export function repairProfileSetDigest(
	profiles: readonly ResolvedRepairProfile[],
): Sha256Digest {
	assertResolvedRepairProfiles(profiles);
	return canonicalJsonDigest({
		protocolVersion: REPAIR_PROFILE_PROTOCOL_VERSION,
		profiles: profiles.map((profile) => ({
			variantId: profile.variantId,
			profileDigest: profile.profileDigest,
		})),
	});
}

export function assertResolvedRepairProfiles(
	profiles: readonly ResolvedRepairProfile[],
	expectedSetDigest?: Sha256Digest,
): void {
	if (!Array.isArray(profiles)) throw new Error("Resolved Repair Profiles must be an array.");
	if (profiles.length > MAX_REPAIR_PROFILES_PER_CHECK) {
		throw new Error(
			`Resolved Repair Profiles cannot contain more than ${MAX_REPAIR_PROFILES_PER_CHECK} entries.`,
		);
	}
	const normalized: ResolvedRepairProfile[] = [];
	for (const [index, profile] of profiles.entries()) {
		assertExactKeys(
			profile,
			[
				"protocolVersion",
				"variantId",
				"match",
				"objective",
				"target",
				"actions",
				"prohibitedShortcuts",
				"requiredContext",
				"verification",
				"routeRecommendation",
				"source",
				"profileDigest",
			],
			`Resolved Repair Profile[${index}]`,
		);
		if (profile.protocolVersion !== REPAIR_PROFILE_PROTOCOL_VERSION) {
			throw new Error(
				`Unsupported Repair Profile protocol version ${String(profile.protocolVersion)}.`,
			);
		}
		const {
			protocolVersion: _protocolVersion,
			variantId: _variantId,
			source: _source,
			profileDigest: _profileDigest,
			...entryInput
		} = profile;
		const entry = normalizeRepairProfileEntry(
			entryInput,
			`Resolved Repair Profile[${index}]`,
		);
		const variantId = repairProfileVariantId(entry.match);
		if (profile.variantId !== variantId) {
			throw new Error(`Repair Profile variantId must be ${variantId}.`);
		}
		assertExactKeys(
			profile.source,
			["layer", "ref", "sourceDigest"],
			`Resolved Repair Profile ${variantId} source`,
		);
		const source = {
			layer: enumValue(
				profile.source.layer,
				SOURCE_LAYERS,
				`Repair Profile ${variantId} source layer`,
			),
			ref: boundedText(
				profile.source.ref,
				`Repair Profile ${variantId} source ref`,
				MAX_SOURCE_REF_LENGTH,
			),
			sourceDigest: profile.source.sourceDigest,
		};
		assertSha256Digest(source.sourceDigest, `Repair Profile ${variantId} sourceDigest`);
		const expectedSourceDigest = canonicalJsonDigest(entry);
		if (source.sourceDigest !== expectedSourceDigest) {
			throw new Error(`Repair Profile ${variantId} sourceDigest does not match content.`);
		}
		const body = {
			protocolVersion: REPAIR_PROFILE_PROTOCOL_VERSION,
			variantId,
			...entry,
			source,
		};
		assertSha256Digest(profile.profileDigest, `Repair Profile ${variantId} profileDigest`);
		if (profile.profileDigest !== canonicalJsonDigest(body)) {
			throw new Error(`Repair Profile ${variantId} profileDigest does not match content.`);
		}
		normalized.push({...body, profileDigest: profile.profileDigest});
	}
	assertUniqueVariantIds(normalized.map((profile) => profile.variantId), "Resolved Repair Profiles");
	const expectedOrder = [...normalized].sort(compareResolvedProfiles);
	if (expectedOrder.some((profile, index) => profile.variantId !== profiles[index]?.variantId)) {
		throw new Error("Resolved Repair Profiles must use canonical variant order.");
	}
	if (expectedSetDigest !== undefined) {
		assertSha256Digest(expectedSetDigest, "Repair Profile set digest");
		const actual = canonicalJsonDigest({
			protocolVersion: REPAIR_PROFILE_PROTOCOL_VERSION,
			profiles: normalized.map((profile) => ({
				variantId: profile.variantId,
				profileDigest: profile.profileDigest,
			})),
		});
		if (expectedSetDigest !== actual) {
			throw new Error("Repair Profile set digest does not match profile variants.");
		}
	}
}

export function defaultRepairProfiles(input: {
	readonly checkId: string;
	readonly requirement: string;
	readonly target: string;
	readonly repairGuidance?: string;
	readonly sourceLayer?: "default_check" | "custom_check" | "global";
	readonly sourceRef?: string;
}): readonly ResolvedRepairProfile[] {
	const checkId = boundedText(input.checkId, "Default Repair Profile Check id", 160);
	boundedText(input.requirement, `Check ${checkId} requirement`, 2_000);
	const target = boundedText(input.target, `Check ${checkId} repair target`, MAX_TARGET_LENGTH);
	const repairGuidance = input.repairGuidance === undefined
		? undefined
		: boundedText(input.repairGuidance, `Check ${checkId} repair guidance`, 2_000);
	return resolveRepairProfiles([
		{
			layer: input.sourceLayer ?? "default_check",
			ref: input.sourceRef ?? checkId,
			profiles: [
				{
					match: {outcome: "fail"},
					objective: `Satisfy ${checkId} for the exact Candidate.`,
					target,
					actions: [
						repairGuidance ?? "Repair every issue identified by structured Check findings.",
						`Repair the Candidate until it satisfies the exact ${checkId} requirement.`,
					],
					prohibitedShortcuts: [
						`Do not disable, exclude, or weaken ${checkId}.`,
						"Do not alter Runtime-owned Candidate, policy, Evidence, or Result bindings.",
					],
					requiredContext: [
						"Exact Candidate",
						"Structured Check findings",
						"Resolved Check binding and admitted Evidence",
					],
					verification: [`Rerun ${checkId} against the exact Candidate.`],
					routeRecommendation: "repair_candidate",
				},
				{
					match: {outcome: "indeterminate"},
					objective: `Restore trustworthy inputs for ${checkId}.`,
					target: "verification-inputs",
					actions: [
						"Resolve missing, stale, contradictory, unavailable, or unusable required inputs.",
						`Rerun ${checkId} without changing its enforcement or authority.`,
					],
					prohibitedShortcuts: [
						"Do not treat an indeterminate outcome as pass.",
						"Do not edit the Candidate merely to guess around unavailable verification.",
					],
					requiredContext: [
						"Indeterminate Check Result",
						"Evidence obligations and execution receipt",
					],
					verification: [
						`Confirm ${checkId} produces a determinate admitted Result for the exact Candidate.`,
					],
					routeRecommendation: "collect_context",
				},
			],
		},
	]);
}

export function matchRepairProfiles(
	input: MatchRepairProfilesInput,
): readonly ResolvedRepairProfile[] {
	assertResolvedRepairProfiles(input.profiles);
	if (!REPAIR_OUTCOMES.includes(input.result.status as RepairProfileOutcome)) {
		return Object.freeze([]);
	}
	const byVariant = new Map(input.profiles.map((profile) => [profile.variantId, profile]));
	const matched = new Map<string, ResolvedRepairProfile>();
	let needsOutcomeFallback = input.result.findings.length === 0;
	for (const finding of input.result.findings) {
		if (!finding.code) {
			needsOutcomeFallback = true;
			continue;
		}
		const exact = byVariant.get(repairProfileVariantId({findingCode: finding.code}));
		if (exact) matched.set(exact.variantId, exact);
		else needsOutcomeFallback = true;
	}
	if (needsOutcomeFallback) {
		const fallback = byVariant.get(
			repairProfileVariantId({outcome: input.result.status as RepairProfileOutcome}),
		);
		if (fallback) matched.set(fallback.variantId, fallback);
	}
	return Object.freeze([...matched.values()].sort(compareResolvedProfiles));
}

function repairProfileVariantId(match: RepairProfileMatch): string {
	return "findingCode" in match
		? `finding:${match.findingCode}`
		: `outcome:${match.outcome}`;
}

function normalizeRepairProfileEntry(value: unknown, label: string): RepairProfileEntry {
	assertExactKeys(
		value,
		[
			"match",
			"objective",
			"target",
			"actions",
			"prohibitedShortcuts",
			"requiredContext",
			"verification",
			"routeRecommendation",
		],
		label,
	);
	const record = value as Record<string, unknown>;
	const match = normalizeMatch(record.match, `${label}.match`);
	const objective = boundedText(record.objective, `${label}.objective`, MAX_OBJECTIVE_LENGTH);
	const target = boundedText(record.target, `${label}.target`, MAX_TARGET_LENGTH);
	const actions = guidanceList(record.actions, `${label}.actions`, true);
	const prohibitedShortcuts = guidanceList(
		record.prohibitedShortcuts,
		`${label}.prohibitedShortcuts`,
		false,
	);
	const requiredContext = guidanceList(
		record.requiredContext,
		`${label}.requiredContext`,
		false,
	);
	const verification = guidanceList(record.verification, `${label}.verification`, true);
	const routeRecommendation = record.routeRecommendation === undefined
		? undefined
		: enumValue(
				record.routeRecommendation,
				ROUTE_RECOMMENDATIONS,
				`${label}.routeRecommendation`,
			);
	return Object.freeze({
		match,
		objective,
		target,
		actions,
		prohibitedShortcuts,
		requiredContext,
		verification,
		...(routeRecommendation ? {routeRecommendation} : {}),
	});
}

function normalizeMatch(value: unknown, label: string): RepairProfileMatch {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new Error(`${label} must be an object.`);
	}
	const record = value as Record<string, unknown>;
	assertExactKeys(record, ["findingCode", "outcome"], label);
	const hasFindingCode = record.findingCode !== undefined;
	const hasOutcome = record.outcome !== undefined;
	if (hasFindingCode === hasOutcome) {
		throw new Error(`${label} requires exactly one of findingCode or outcome.`);
	}
	return hasFindingCode
		? Object.freeze({
				findingCode: boundedText(
					record.findingCode,
					`${label}.findingCode`,
					MAX_FINDING_CODE_LENGTH,
				),
			})
		: Object.freeze({
				outcome: enumValue(record.outcome, REPAIR_OUTCOMES, `${label}.outcome`),
			});
}

function guidanceList(value: unknown, label: string, required: boolean): readonly string[] {
	if (value === undefined && !required) return Object.freeze([]);
	if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
	if ((required && value.length === 0) || value.length > MAX_GUIDANCE_ITEMS) {
		throw new Error(
			`${label} must contain ${required ? "between 1 and" : "at most"} ${MAX_GUIDANCE_ITEMS} items.`,
		);
	}
	const items = value.map((entry, index) =>
		boundedText(entry, `${label}[${index}]`, MAX_GUIDANCE_ITEM_LENGTH),
	);
	if (new Set(items).size !== items.length) throw new Error(`${label} contains duplicates.`);
	return Object.freeze(items);
}

function boundedText(value: unknown, label: string, maximum: number): string {
	if (
		typeof value !== "string" ||
		value.length === 0 ||
		value.length > maximum ||
		value !== value.trim()
	) {
		throw new Error(`${label} must be trimmed text between 1 and ${maximum} characters.`);
	}
	return value;
}

function enumValue<const T extends string>(
	value: unknown,
	allowed: readonly T[],
	label: string,
): T {
	if (typeof value !== "string" || !allowed.includes(value as T)) {
		throw new Error(`${label} must be one of ${allowed.join(", ")}.`);
	}
	return value as T;
}

function assertMaximumResolvedProfiles(count: number): void {
	if (count > MAX_REPAIR_PROFILES_PER_CHECK) {
		throw new Error(
			`Resolved Repair Profiles cannot contain more than ${MAX_REPAIR_PROFILES_PER_CHECK} entries.`,
		);
	}
}

function assertUniqueVariantIds(values: readonly string[], label: string): void {
	if (new Set(values).size !== values.length) {
		throw new Error(`${label} contains duplicate match variants.`);
	}
}

function compareProfileEntries(left: RepairProfileEntry, right: RepairProfileEntry): number {
	return repairProfileVariantId(left.match).localeCompare(repairProfileVariantId(right.match));
}

function compareResolvedProfiles(
	left: ResolvedRepairProfile,
	right: ResolvedRepairProfile,
): number {
	return left.variantId.localeCompare(right.variantId);
}

function freezeRepairProfile(profile: ResolvedRepairProfile): ResolvedRepairProfile {
	Object.freeze(profile.match);
	Object.freeze(profile.actions);
	Object.freeze(profile.prohibitedShortcuts);
	Object.freeze(profile.requiredContext);
	Object.freeze(profile.verification);
	Object.freeze(profile.source);
	return Object.freeze(profile);
}
