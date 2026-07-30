import type { OkfDocument, OkfFrontmatterValue } from "./okf-frontmatter.ts";
import { toCanonicalJsonValue } from "../utils/canonical-json.ts";

const OKF_V02_VERSION = "0.2" as const;
export const CODEWIKI_AUTHORED_RELATIONSHIP_TYPES = Object.freeze([
	"depends_on",
	"constrains",
	"refines",
	"realizes",
	"verifies",
	"supersedes",
	"derived_from",
] as const);

export type CodeWikiAuthoredRelationshipType =
	(typeof CODEWIKI_AUTHORED_RELATIONSHIP_TYPES)[number];
export type OkfTrustTier = "unverified" | "machine-confirmed" | "human-reviewed";
export type OkfLifecycleStatus = "draft" | "stable" | "deprecated";

interface OkfUsageWindowV02 {
	readonly from: string;
	readonly to: string;
}

interface OkfSourceV02 {
	readonly id?: string;
	readonly resource: string;
	readonly title?: string;
	readonly author?: string;
	readonly usage_count?: number;
	readonly last_modified?: string;
	readonly usage_window?: OkfUsageWindowV02;
	readonly [producerExtension: string]: unknown;
}

interface OkfActorEventV02 {
	readonly by: string;
	readonly at: string;
}

export interface CodeWikiAuthoredRelationship {
	readonly type: CodeWikiAuthoredRelationshipType;
	readonly target: string;
	readonly rationale: string;
}

interface OkfProfileIssue {
	readonly code:
		| "invalid_sources"
		| "invalid_usage_window"
		| "invalid_generated"
		| "invalid_verified"
		| "invalid_status"
		| "invalid_stale_after"
		| "invalid_actor"
		| "invalid_attested_computation"
		| "invalid_authored_relationship";
	readonly field: string;
	readonly message: string;
}

interface OkfAttestedComputationProfile {
	readonly runtime: string | null;
	readonly parameters: readonly unknown[];
	readonly computation: string | null;
	readonly executor: Readonly<Record<string, unknown>> | null;
	readonly attester: Readonly<Record<string, unknown>> | null;
	readonly executable: false;
}

interface OkfV02Profile {
	readonly conceptId: string;
	readonly formatVersion: "0.2" | "0.1-fallback";
	readonly type: string;
	readonly title: string | null;
	readonly sources: readonly OkfSourceV02[];
	readonly usageWindow: OkfUsageWindowV02 | null;
	readonly generated: OkfActorEventV02 | null;
	readonly legacyTimestamp: string | null;
	readonly verified: readonly OkfActorEventV02[];
	readonly trustTier: OkfTrustTier;
	readonly status: OkfLifecycleStatus;
	readonly staleAfter: string | null;
	readonly stale: boolean | null;
	readonly relationships: readonly CodeWikiAuthoredRelationship[];
	readonly attestedComputation: OkfAttestedComputationProfile | null;
	readonly issues: readonly OkfProfileIssue[];
	readonly frontmatter: OkfFrontmatterValue;
}

interface AnalyzeOkfV02Options {
	readonly today?: string;
}

export function analyzeOkfV02Document(
	document: OkfDocument,
	options: AnalyzeOkfV02Options = {},
): OkfV02Profile {
	if (
		document.kind !== "concept" ||
		!document.frontmatter ||
		!document.conceptId
	) {
		throw new Error("OKF v0.2 profile analysis requires a concept document.");
	}
	const issues: OkfProfileIssue[] = [];
	const frontmatter = document.frontmatter;
	const sources = parseSources(frontmatter.sources, issues);
	const usageWindow = parseUsageWindow(
		frontmatter.usage_window,
		"usage_window",
		issues,
	);
	const generated = parseGenerated(frontmatter.generated, issues);
	const verified = parseVerified(frontmatter.verified, issues);
	const status = parseStatus(frontmatter.status, issues);
	const staleAfter = parseStaleAfter(frontmatter.stale_after, issues);
	const relationships = parseRelationships(
		frontmatter.codewiki_relationships,
		issues,
	);
	const attestedComputation = parseAttestedComputation(frontmatter, issues);
	const legacyTimestamp =
		generated === null && isIsoTimestamp(frontmatter.timestamp)
			? frontmatter.timestamp
			: null;
	if (options.today !== undefined && !isIsoDate(options.today)) {
		throw new Error("OKF v0.2 analysis today must be an ISO date.");
	}
	return canonicalValue({
		conceptId: document.conceptId,
		formatVersion: targetsOkfV02(frontmatter) ? "0.2" : "0.1-fallback",
		type: typeof frontmatter.type === "string" ? frontmatter.type : "",
		title: typeof frontmatter.title === "string" ? frontmatter.title : null,
		sources,
		usageWindow,
		generated,
		legacyTimestamp,
		verified,
		trustTier: trustTierFor(verified),
		status,
		staleAfter,
		stale: staleAfter && options.today ? options.today >= staleAfter : null,
		relationships,
		attestedComputation,
		issues,
		frontmatter,
	});
}

interface CreateOkfAttestedComputationV02Input {
	readonly runtime: string;
	readonly parameters?: readonly unknown[];
	readonly computation?: string;
	readonly executor: Readonly<Record<string, unknown>>;
	readonly attester: Readonly<Record<string, unknown>>;
}

interface CreateCodeWikiOkfV02FrontmatterInput {
	readonly type: string;
	readonly title?: string;
	readonly description?: string;
	readonly resource?: string;
	readonly tags?: readonly string[];
	readonly generated: OkfActorEventV02;
	readonly sources?: readonly OkfSourceV02[];
	readonly usageWindow?: OkfUsageWindowV02;
	readonly verified?: readonly OkfActorEventV02[];
	readonly status?: OkfLifecycleStatus;
	readonly staleAfter?: string;
	readonly relationships?: readonly CodeWikiAuthoredRelationship[];
	readonly attestedComputation?: CreateOkfAttestedComputationV02Input;
	readonly extensions?: Readonly<Record<string, unknown>>;
}

const STANDARD_FRONTMATTER_KEYS = new Set([
	"type",
	"title",
	"description",
	"resource",
	"tags",
	"sources",
	"usage_window",
	"generated",
	"verified",
	"status",
	"stale_after",
	"runtime",
	"parameters",
	"computation",
	"executor",
	"attester",
	"codewiki_relationships",
	"timestamp",
]);

export function createCodeWikiOkfV02Frontmatter(
	input: CreateCodeWikiOkfV02FrontmatterInput,
): OkfFrontmatterValue {
	assertV02ProducerMetadata(input);
	assertV02AttestedContract(input);
	assertV02Lifecycle(input);
	assertV02Extensions(input.extensions);
	return canonicalValue(frontmatterFromInput(input));
}

function assertV02ProducerMetadata(
	input: CreateCodeWikiOkfV02FrontmatterInput,
): void {
	if (!isNonEmptyText(input.type)) throw new Error("OKF v0.2 type is required.");
	for (const [field, value] of [
		["title", input.title],
		["description", input.description],
		["resource", input.resource],
	] as const) {
		if (value !== undefined && !isNonEmptyText(value)) {
			throw new Error(`OKF v0.2 ${field} must be a non-empty string.`);
		}
	}
	if (input.tags?.some((tag) => !isNonEmptyText(tag))) {
		throw new Error("OKF v0.2 tags must be non-empty strings.");
	}
	assertActorEvent(input.generated, "generated");
	input.verified?.forEach((entry, index) =>
		assertActorEvent(entry, `verified[${index}]`),
	);
	input.sources?.forEach((entry, index) => assertSource(entry, index));
	if (input.usageWindow) assertUsageWindow(input.usageWindow, "usage_window");
	input.relationships?.forEach(assertAuthoredRelationship);
}

function assertV02AttestedContract(
	input: CreateCodeWikiOkfV02FrontmatterInput,
): void {
	if (input.type === "Attested Computation") {
		if (!input.attestedComputation) {
			throw new Error(
				"OKF v0.2 Attested Computation requires an inert computation contract.",
			);
		}
		assertAttestedComputationInput(input.attestedComputation);
		return;
	}
	if (input.attestedComputation) {
		throw new Error(
			"OKF v0.2 computation contract requires type Attested Computation.",
		);
	}
}

function assertV02Lifecycle(input: CreateCodeWikiOkfV02FrontmatterInput): void {
	if (
		input.status !== undefined &&
		input.status !== "draft" &&
		input.status !== "stable" &&
		input.status !== "deprecated"
	) {
		throw new Error("OKF v0.2 status must be draft, stable, or deprecated.");
	}
	if (input.staleAfter && !isIsoDate(input.staleAfter)) {
		throw new Error("OKF v0.2 stale_after must be an ISO date.");
	}
}

function assertV02Extensions(
	extensions: Readonly<Record<string, unknown>> | undefined,
): void {
	for (const key of Object.keys(extensions ?? {})) {
		if (STANDARD_FRONTMATTER_KEYS.has(key)) {
			throw new Error(`OKF v0.2 extension cannot replace standard field ${key}.`);
		}
	}
}

function frontmatterFromInput(
	input: CreateCodeWikiOkfV02FrontmatterInput,
): Readonly<Record<string, unknown>> {
	return {
		...(input.extensions ?? {}),
		type: input.type,
		...(input.title ? {title: input.title} : {}),
		...(input.description ? {description: input.description} : {}),
		...(input.resource ? {resource: input.resource} : {}),
		...(input.tags ? {tags: [...input.tags]} : {}),
		...(input.sources ? {sources: input.sources} : {}),
		...(input.usageWindow ? {usage_window: input.usageWindow} : {}),
		generated: input.generated,
		...(input.verified ? {verified: input.verified} : {}),
		status: input.status ?? "stable",
		...(input.staleAfter ? {stale_after: input.staleAfter} : {}),
		...attestedComputationFrontmatter(input.attestedComputation),
		...(input.relationships
			? {codewiki_relationships: input.relationships}
			: {}),
	};
}

function attestedComputationFrontmatter(
	input: CreateOkfAttestedComputationV02Input | undefined,
): Readonly<Record<string, unknown>> {
	if (!input) return {};
	return {
		runtime: input.runtime,
		...(input.parameters ? {parameters: input.parameters} : {}),
		...(input.computation ? {computation: input.computation} : {}),
		executor: input.executor,
		attester: input.attester,
	};
}

export function okfV02RootIndexFrontmatter(): Readonly<{
	okf_version: typeof OKF_V02_VERSION;
}> {
	return Object.freeze({okf_version: OKF_V02_VERSION});
}

function parseSources(
	value: unknown,
	issues: OkfProfileIssue[],
): OkfSourceV02[] {
	if (value === undefined) return [];
	if (!Array.isArray(value)) {
		issues.push(profileIssue("invalid_sources", "sources", "sources must be a list."));
		return [];
	}
	return value.flatMap((entry, index) => {
		if (!isRecord(entry) || !isNonEmptyText(entry.resource)) {
			issues.push(
				profileIssue(
					"invalid_sources",
					`sources[${index}]`,
					"source entry requires resource.",
				),
			);
			return [];
		}
		return [normalizeSource(entry, index, issues)];
	});
}

function normalizeSource(
	entry: Record<string, unknown>,
	index: number,
	issues: OkfProfileIssue[],
): OkfSourceV02 {
	let source = {...entry};
	for (const field of ["id", "title"] as const) {
		if (source[field] !== undefined && !isNonEmptyText(source[field])) {
			issues.push(
				profileIssue(
					"invalid_sources",
					`sources[${index}].${field}`,
					`source ${field} must be a non-empty string.`,
				),
			);
			source = omitRecordKey(source, field);
		}
	}
	if (source.author !== undefined && !isActor(source.author)) {
		issues.push(
			profileIssue(
				"invalid_actor",
				`sources[${index}].author`,
				"source author does not follow the actor convention.",
			),
		);
		source = omitRecordKey(source, "author");
	}
	if (
		source.usage_count !== undefined &&
		(!Number.isSafeInteger(source.usage_count) || Number(source.usage_count) < 0)
	) {
		issues.push(
			profileIssue(
				"invalid_sources",
				`sources[${index}].usage_count`,
				"source usage_count must be a non-negative safe integer.",
			),
		);
		source = omitRecordKey(source, "usage_count");
	}
	if (source.last_modified !== undefined && !isIsoDate(source.last_modified)) {
		issues.push(
			profileIssue(
				"invalid_sources",
				`sources[${index}].last_modified`,
				"source last_modified must be an ISO date.",
			),
		);
		source = omitRecordKey(source, "last_modified");
	}
	if (source.usage_window !== undefined) {
		const usageWindow = parseUsageWindow(
			source.usage_window,
			`sources[${index}].usage_window`,
			issues,
		);
		if (usageWindow) source = {...source, usage_window: usageWindow};
		else source = omitRecordKey(source, "usage_window");
	}
	return canonicalValue(source) as OkfSourceV02;
}

function omitRecordKey(
	record: Record<string, unknown>,
	key: string,
): Record<string, unknown> {
	return Object.fromEntries(
		Object.entries(record).filter(([entryKey]) => entryKey !== key),
	);
}

function parseUsageWindow(
	value: unknown,
	field: string,
	issues: OkfProfileIssue[],
): OkfUsageWindowV02 | null {
	if (value === undefined) return null;
	if (
		!isRecord(value) ||
		!isIsoDate(value.from) ||
		!isIsoDate(value.to) ||
		value.from > value.to
	) {
		issues.push(
			profileIssue(
				"invalid_usage_window",
				field,
				"usage window requires ordered ISO from and to dates.",
			),
		);
		return null;
	}
	return {from: value.from, to: value.to};
}

function parseGenerated(
	value: unknown,
	issues: OkfProfileIssue[],
): OkfActorEventV02 | null {
	if (value === undefined) return null;
	if (!isActorEvent(value)) {
		issues.push(
			profileIssue(
				"invalid_generated",
				"generated",
				"generated requires valid by and at fields.",
			),
		);
		return null;
	}
	return value;
}

function parseVerified(
	value: unknown,
	issues: OkfProfileIssue[],
): OkfActorEventV02[] {
	if (value === undefined) return [];
	const values = Array.isArray(value) ? value : [value];
	const valid = values.filter(isActorEvent);
	if (valid.length !== values.length) {
		issues.push(
			profileIssue(
				"invalid_verified",
				"verified",
				"verified entries require valid by and at fields.",
			),
		);
	}
	return valid;
}

function parseStatus(
	value: unknown,
	issues: OkfProfileIssue[],
): OkfLifecycleStatus {
	if (value === undefined) return "stable";
	if (value === "draft" || value === "stable" || value === "deprecated") {
		return value;
	}
	issues.push(
		profileIssue(
			"invalid_status",
			"status",
			"status must be draft, stable, or deprecated.",
		),
	);
	return "stable";
}

function parseStaleAfter(
	value: unknown,
	issues: OkfProfileIssue[],
): string | null {
	if (value === undefined) return null;
	if (isIsoDate(value)) return value;
	issues.push(
		profileIssue(
			"invalid_stale_after",
			"stale_after",
			"stale_after must be an ISO date.",
		),
	);
	return null;
}

function parseRelationships(
	value: unknown,
	issues: OkfProfileIssue[],
): CodeWikiAuthoredRelationship[] {
	if (value === undefined) return [];
	if (!Array.isArray(value)) {
		issues.push(
			profileIssue(
				"invalid_authored_relationship",
				"codewiki_relationships",
				"authored relationships must be a list.",
			),
		);
		return [];
	}
	return value.flatMap((entry, index) => {
		if (!isAuthoredRelationship(entry)) {
			issues.push(
				profileIssue(
					"invalid_authored_relationship",
					`codewiki_relationships[${index}]`,
					"relationship type, target, or rationale is invalid.",
				),
			);
			return [];
		}
		return [entry];
	});
}

function parseAttestedComputation(
	frontmatter: OkfFrontmatterValue,
	issues: OkfProfileIssue[],
): OkfAttestedComputationProfile | null {
	if (frontmatter.type !== "Attested Computation") return null;
	const runtime = isNonEmptyText(frontmatter.runtime) ? frontmatter.runtime : null;
	const parameters = Array.isArray(frontmatter.parameters)
		? frontmatter.parameters
		: [];
	const executor = isRecord(frontmatter.executor) ? frontmatter.executor : null;
	const attester = isRecord(frontmatter.attester) ? frontmatter.attester : null;
	const computation = isNonEmptyText(frontmatter.computation)
		? frontmatter.computation
		: null;
	if (
		!isValidAttestedFrontmatter({
			frontmatter,
			runtime,
			computation,
			executor,
			attester,
		})
	) {
		issues.push(
			profileIssue(
				"invalid_attested_computation",
				"type",
				"Attested Computation requires runtime, executor, and attester contracts.",
			),
		);
	}
	return {
		runtime,
		parameters,
		computation,
		executor,
		attester,
		executable: false,
	};
}

function targetsOkfV02(frontmatter: OkfFrontmatterValue): boolean {
	return [
		"sources",
		"usage_window",
		"generated",
		"verified",
		"status",
		"stale_after",
		"runtime",
		"parameters",
		"computation",
		"executor",
		"attester",
	].some((field) => Object.hasOwn(frontmatter, field));
}

function trustTierFor(verified: readonly OkfActorEventV02[]): OkfTrustTier {
	if (verified.some((entry) => entry.by.startsWith("human:"))) {
		return "human-reviewed";
	}
	return verified.length > 0 ? "machine-confirmed" : "unverified";
}

interface ParsedAttestedContract {
	readonly frontmatter: OkfFrontmatterValue;
	readonly runtime: string | null;
	readonly computation: string | null;
	readonly executor: Readonly<Record<string, unknown>> | null;
	readonly attester: Readonly<Record<string, unknown>> | null;
}

function isValidAttestedFrontmatter(input: ParsedAttestedContract): boolean {
	const parametersValid =
		input.frontmatter.parameters === undefined ||
		(Array.isArray(input.frontmatter.parameters) &&
			input.frontmatter.parameters.every(isComputationParameter));
	const computationValid =
		input.frontmatter.computation === undefined || Boolean(input.computation);
	return (
		Boolean(input.runtime) &&
		parametersValid &&
		computationValid &&
		isExecutorContract(input.executor) &&
		isAttesterContract(input.attester)
	);
}

function assertAttestedComputationInput(
	input: CreateOkfAttestedComputationV02Input,
): void {
	if (!isNonEmptyText(input.runtime)) {
		throw new Error("OKF v0.2 Attested Computation runtime is required.");
	}
	if (input.computation !== undefined && !isNonEmptyText(input.computation)) {
		throw new Error("OKF v0.2 Attested Computation computation path is invalid.");
	}
	for (const [index, parameter] of (input.parameters ?? []).entries()) {
		if (!isComputationParameter(parameter)) {
			throw new Error(
				`OKF v0.2 Attested Computation parameters[${index}] is invalid.`,
			);
		}
	}
	if (!isExecutorContract(input.executor)) {
		throw new Error("OKF v0.2 Attested Computation executor is invalid.");
	}
	if (!isAttesterContract(input.attester)) {
		throw new Error("OKF v0.2 Attested Computation attester is invalid.");
	}
}

function isComputationParameter(value: unknown): boolean {
	return (
		isRecord(value) &&
		isNonEmptyText(value.name) &&
		isNonEmptyText(value.type) &&
		typeof value.required === "boolean"
	);
}

function isExecutorContract(value: unknown): boolean {
	return (
		isRecord(value) &&
		isNonEmptyText(value.resource) &&
		Array.isArray(value.receipt) &&
		value.receipt.every(isNonEmptyText)
	);
}

function isAttesterContract(value: unknown): boolean {
	return isRecord(value) && isNonEmptyText(value.resource);
}

function assertSource(source: OkfSourceV02, index: number): void {
	if (!isNonEmptyText(source.resource)) {
		throw new Error(`OKF v0.2 sources[${index}] requires resource.`);
	}
	for (const field of ["id", "title"] as const) {
		if (source[field] !== undefined && !isNonEmptyText(source[field])) {
			throw new Error(`OKF v0.2 sources[${index}].${field} is invalid.`);
		}
	}
	if (source.author !== undefined && !isActor(source.author)) {
		throw new Error(`OKF v0.2 sources[${index}].author is invalid.`);
	}
	if (
		source.usage_count !== undefined &&
		(!Number.isSafeInteger(source.usage_count) || source.usage_count < 0)
	) {
		throw new Error(`OKF v0.2 sources[${index}].usage_count is invalid.`);
	}
	if (source.last_modified !== undefined && !isIsoDate(source.last_modified)) {
		throw new Error(`OKF v0.2 sources[${index}].last_modified is invalid.`);
	}
	if (source.usage_window) {
		assertUsageWindow(source.usage_window, `sources[${index}].usage_window`);
	}
}

function assertUsageWindow(window: OkfUsageWindowV02, field: string): void {
	if (!isIsoDate(window.from) || !isIsoDate(window.to) || window.from > window.to) {
		throw new Error(`OKF v0.2 ${field} requires ordered ISO from and to dates.`);
	}
}

function assertActorEvent(event: OkfActorEventV02, field: string): void {
	if (!isActorEvent(event)) {
		throw new Error(`OKF v0.2 ${field} requires valid by and at fields.`);
	}
}

function assertAuthoredRelationship(
	relationship: CodeWikiAuthoredRelationship,
): void {
	if (!isAuthoredRelationship(relationship)) {
		throw new Error("CodeWiki authored relationship is invalid or unsupported.");
	}
}

function isAuthoredRelationship(
	value: unknown,
): value is CodeWikiAuthoredRelationship {
	return (
		isRecord(value) &&
		Object.keys(value).every((key) =>
			["type", "target", "rationale"].includes(key),
		) &&
		CODEWIKI_AUTHORED_RELATIONSHIP_TYPES.includes(
			value.type as CodeWikiAuthoredRelationshipType,
		) &&
		value.type !== "related_to" &&
		isNonEmptyText(value.target) &&
		isNonEmptyText(value.rationale)
	);
}

function isActorEvent(value: unknown): value is OkfActorEventV02 {
	return (
		isRecord(value) &&
		Object.keys(value).every((key) => key === "by" || key === "at") &&
		isActor(value.by) &&
		isIsoTimestamp(value.at)
	);
}

function isActor(value: unknown): value is string {
	return (
		isNonEmptyText(value) &&
		(value.startsWith("human:") ||
			value.startsWith("process:") ||
			/^[^/\s]+\/[^/\s]+$/.test(value))
	);
}

function isIsoTimestamp(value: unknown): value is string {
	return (
		typeof value === "string" &&
		!Number.isNaN(Date.parse(value)) &&
		/^\d{4}-\d{2}-\d{2}T/.test(value)
	);
}

function isIsoDate(value: unknown): value is string {
	if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
		return false;
	}
	const parsed = new Date(`${value}T00:00:00.000Z`);
	return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().startsWith(value);
}

function isNonEmptyText(value: unknown): value is string {
	return typeof value === "string" && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function profileIssue(
	code: OkfProfileIssue["code"],
	field: string,
	message: string,
): OkfProfileIssue {
	return {code, field, message};
}

function canonicalValue<T>(value: unknown): T {
	return toCanonicalJsonValue(value) as unknown as T;
}
