export type CodewikiToolSurface = "normal" | "compatibility";

export interface CodewikiToolSurfaceMetadata {
	surface: CodewikiToolSurface;
	compatibility_alias_for?: string;
	deprecated?: boolean;
	deprecation_message?: string;
}

export const CODEWIKI_NORMAL_WORKFLOW_TOOLS = [
	"wiki_state",
	"wiki_decide",
	"wiki_plan",
	"wiki_implement",
	"wiki_gate",
	"wiki_runtime",
] as const;

export const CODEWIKI_TOOL_SURFACE: Record<
	string,
	CodewikiToolSurfaceMetadata
> = {
	wiki_state: { surface: "normal" },
	wiki_decide: { surface: "normal" },
	wiki_plan: { surface: "normal" },
	wiki_implement: { surface: "normal" },
	wiki_gate: { surface: "normal" },
	wiki_runtime: { surface: "normal" },

	wiki_setup: {
		surface: "compatibility",
		compatibility_alias_for: "/wiki bootstrap",
		deprecated: true,
		deprecation_message:
			"Use /wiki bootstrap for normal onboarding; reserve wiki_setup for expert adapter compatibility.",
	},
	wiki_bootstrap: {
		surface: "compatibility",
		compatibility_alias_for: "/wiki bootstrap",
		deprecated: true,
		deprecation_message:
			"Use /wiki bootstrap for normal onboarding; reserve wiki_bootstrap for expert adapter compatibility.",
	},
	wiki_resume_context: {
		surface: "compatibility",
		compatibility_alias_for: "wiki_state",
		deprecated: true,
		deprecation_message:
			"Use wiki_state or /wiki resume for normal continuation; reserve wiki_resume_context for explicit source-backed packet recovery.",
	},
	wiki_artifact_status: {
		surface: "compatibility",
		compatibility_alias_for: "wiki_runtime",
		deprecated: true,
		deprecation_message:
			"Use wiki_runtime for normal lease, wait, and wake operations; reserve wiki_artifact_status for expert compatibility.",
	},
	wiki_audit: {
		surface: "compatibility",
		compatibility_alias_for: "wiki_gate",
		deprecated: true,
		deprecation_message:
			"Use wiki_gate for normal gate/linter evidence routing; reserve wiki_audit for deterministic expert linter runs through the compatibility alias.",
	},
	wiki_build: {
		surface: "compatibility",
		compatibility_alias_for: "wiki_decide|wiki_plan|wiki_implement",
		deprecated: true,
		deprecation_message:
			"Use wiki_decide, wiki_plan, or wiki_implement for normal compiler-build creation; reserve wiki_build for expert compatibility.",
	},
	wiki_gateway: {
		surface: "compatibility",
		compatibility_alias_for: "wiki_gate",
		deprecated: true,
		deprecation_message:
			"Use wiki_gate for normal preflight and validation; reserve wiki_gateway for expert compatibility.",
	},
	wiki_gc: {
		surface: "compatibility",
		compatibility_alias_for: "wiki_runtime",
		deprecated: true,
		deprecation_message:
			"Use wiki_runtime for normal lifecycle/archive coordination; reserve wiki_gc for expert post-commit cleanup.",
	},
	wiki_roadmap: {
		surface: "compatibility",
		compatibility_alias_for: "wiki_plan",
		deprecated: true,
		deprecation_message:
			"Use wiki_plan for normal roadmap and sprint alignment; reserve wiki_roadmap for expert compatibility.",
	},
	wiki_diff_table: {
		surface: "compatibility",
		compatibility_alias_for: "wiki_decide",
		deprecated: true,
		deprecation_message:
			"Use wiki_decide for normal decision row work; reserve wiki_diff_table for expert compatibility.",
	},
	wiki_session: {
		surface: "compatibility",
		compatibility_alias_for: "wiki_runtime",
		deprecated: true,
		deprecation_message:
			"Use wiki_runtime for normal session focus and context boundaries; reserve wiki_session for expert compatibility.",
	},
	wiki_agency: {
		surface: "compatibility",
		compatibility_alias_for: "wiki_runtime",
		deprecated: true,
		deprecation_message:
			"Use wiki_runtime for normal agency scheduling; reserve wiki_agency for expert compatibility.",
	},
};

export function codewikiToolMetadata(name: string): Record<string, unknown> {
	const metadata = CODEWIKI_TOOL_SURFACE[name] ?? {
		surface: "compatibility",
		deprecated: true,
		deprecation_message:
			"Uncataloged CodeWiki tool; reserve for expert compatibility until the source contract is updated.",
	};
	return {
		codewikiToolSurface: metadata.surface,
		codewikiNormalWorkflowTool: metadata.surface === "normal",
		codewikiDeprecated: metadata.deprecated ?? false,
		codewikiCompatibilityAliasFor: metadata.compatibility_alias_for,
		codewikiDeprecationMessage: metadata.deprecation_message,
	};
}
