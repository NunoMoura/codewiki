import type { ImplementationEvidencePolicy } from "../../loops/implementation/evidence-policy.ts";
import type {
	LanguageReviewPack,
	LanguageReviewPackSkipSummary,
} from "./language-pack.ts";
import { selectLanguageReviewPacks } from "./language-pack.ts";
import {
	createJavaScriptLintReviewPack,
	type JavaScriptLintReviewPackOptions,
} from "./languages/javascript-lint.ts";
import {
	createTypeScriptReviewPack,
	type TypeScriptReviewPackOptions,
} from "./languages/typescript.ts";
import {
	createPythonPyrightReviewPack,
	createPythonRuffReviewPack,
	type PythonReviewPackOptions,
} from "./languages/python.ts";
import {
	createGoTestReviewPack,
	createGoVetReviewPack,
	type GoReviewPackOptions,
} from "./languages/go.ts";
import {
	createRustCargoClippyReviewPack,
	createRustCargoTestReviewPack,
	type RustReviewPackOptions,
} from "./languages/rust.ts";
import {
	createShellcheckReviewPack,
	type ShellcheckReviewPackOptions,
} from "./languages/shell.ts";

export type ReviewPackFactoryOptions = TypeScriptReviewPackOptions &
	JavaScriptLintReviewPackOptions &
	PythonReviewPackOptions &
	GoReviewPackOptions &
	RustReviewPackOptions &
	ShellcheckReviewPackOptions;

export interface ReviewPackPolicy {
	enabled?: boolean;
	enabledPacks?: string[];
	disabledPacks?: string[];
	requiredPacks?: string[];
}

export interface ReviewPackSelection {
	availablePacks: LanguageReviewPack[];
	enabledPacks: LanguageReviewPack[];
	selectedPacks: LanguageReviewPack[];
	skippedPacks: LanguageReviewPackSkipSummary[];
}

export const defaultReviewPackIds = [
	"tsjs.typescript",
	"tsjs.lint",
	"python.ruff",
	"python.pyright",
	"go.test",
	"go.vet",
	"rust.cargo-test",
	"rust.cargo-clippy",
	"shell.shellcheck",
] as const;

export function createDefaultLanguageReviewPacks(
	options: ReviewPackFactoryOptions = {},
): LanguageReviewPack[] {
	return [
		createTypeScriptReviewPack(options),
		createJavaScriptLintReviewPack(options),
		createPythonRuffReviewPack(options),
		createPythonPyrightReviewPack(options),
		createGoTestReviewPack(options),
		createGoVetReviewPack(options),
		createRustCargoTestReviewPack(options),
		createRustCargoClippyReviewPack(options),
		createShellcheckReviewPack(options),
	];
}

export function reviewPackSelectionForPolicy(
	policy: ReviewPackPolicy = {},
	changedPaths: string[] = [],
	options: ReviewPackFactoryOptions = {},
	evidencePolicy?: ImplementationEvidencePolicy,
): ReviewPackSelection {
	const mergedPolicy = mergeReviewPackPolicyWithEvidencePolicy(
		policy,
		evidencePolicy,
	);
	const availablePacks = createDefaultLanguageReviewPacks(options);
	if (mergedPolicy.enabled === false) {
		return {
			availablePacks,
			enabledPacks: [],
			selectedPacks: [],
			skippedPacks: availablePacks.map((pack) => ({
				id: pack.id,
				label: pack.label,
				reason: "disabled" as const,
				languages: pack.languages,
			})),
		};
	}
	const enabledPacks = reviewPacksForPolicy(mergedPolicy, options);
	const selectedPacks = selectLanguageReviewPacks(enabledPacks, changedPaths);
	const enabledIds = new Set(enabledPacks.map((pack) => pack.id));
	const selectedIds = new Set(selectedPacks.map((pack) => pack.id));
	const disabledIds = new Set(mergedPolicy.disabledPacks || []);
	const explicitlyEnabled = new Set(mergedPolicy.enabledPacks || []);
	return {
		availablePacks,
		enabledPacks,
		selectedPacks,
		skippedPacks: [
			...availablePacks
				.filter((pack) => !enabledIds.has(pack.id))
				.map(
					(pack): LanguageReviewPackSkipSummary => ({
						id: pack.id,
						label: pack.label,
						reason: disabledIds.has(pack.id) ? "disabled" : "not-enabled",
						languages: pack.languages,
					}),
				),
			...enabledPacks
				.filter((pack) => !selectedIds.has(pack.id))
				.filter(
					(pack) =>
						explicitlyEnabled.size === 0 || explicitlyEnabled.has(pack.id),
				)
				.map(
					(pack): LanguageReviewPackSkipSummary => ({
						id: pack.id,
						label: pack.label,
						reason: "no-matching-files",
						languages: pack.languages,
					}),
				),
		],
	};
}

export function mergeReviewPackPolicyWithEvidencePolicy(
	policy: ReviewPackPolicy = {},
	evidencePolicy?: ImplementationEvidencePolicy,
): ReviewPackPolicy {
	if (!evidencePolicy) return policy;
	const requiredPacks = unique([
		...(policy.requiredPacks || []),
		...evidencePolicy.requiredReviewPacks,
	]);
	const enabledPacks = policy.enabledPacks?.length
		? unique([...policy.enabledPacks, ...requiredPacks])
		: policy.enabledPacks;
	const disabled = new Set(policy.disabledPacks || []);
	return {
		...policy,
		...(enabledPacks ? { enabledPacks } : {}),
		disabledPacks: (policy.disabledPacks || []).filter(
			(packId) => !requiredPacks.includes(packId),
		),
		requiredPacks,
		...(requiredPacks.some((packId) => disabled.has(packId))
			? { enabled: policy.enabled }
			: {}),
	};
}

export function reviewPacksForPolicy(
	policy: ReviewPackPolicy = {},
	options: ReviewPackFactoryOptions = {},
): LanguageReviewPack[] {
	const packs = createDefaultLanguageReviewPacks(options);
	const enabled = new Set(policy.enabledPacks || []);
	const disabled = new Set(policy.disabledPacks || []);
	return packs.filter(
		(pack) =>
			(enabled.size === 0 || enabled.has(pack.id)) && !disabled.has(pack.id),
	);
}

function unique(values: string[]): string[] {
	return Array.from(
		new Set(values.map((value) => value.trim()).filter(Boolean)),
	);
}
