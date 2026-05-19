export type CodewikiToolLayer = "bootstrap" | "state" | "coordination" | "compiler" | "roadmap" | "validation" | "session" | "agency" | "gc";

export interface CodewikiToolContract {
	name: string;
	module: string;
	layer: CodewikiToolLayer;
	summary: string;
	safeMutationPath: string;
}

export const CODEWIKI_TOOL_CONTRACTS = [
	{
		name: "codewiki_setup",
		module: "src/application/tools/bootstrap.ts",
		layer: "bootstrap",
		summary: "Adopt or initialize CodeWiki without overwriting starter files.",
		safeMutationPath: "Tool execution delegates through the application bootstrap tool contract; root resolution and Pi command UI stay adapter-owned.",
	},
	{
		name: "codewiki_bootstrap",
		module: "src/application/tools/bootstrap.ts",
		layer: "bootstrap",
		summary: "Scaffold starter CodeWiki files, optionally forcing starter overwrite.",
		safeMutationPath: "Tool execution delegates through the application bootstrap tool contract; root resolution and Pi command UI stay adapter-owned.",
	},
	{
		name: "codewiki_state",
		module: "src/application/tools/state.ts",
		layer: "state",
		summary: "Read graph-first CodeWiki state through injected file/rebuild/session ports.",
		safeMutationPath: "Read-only except optional generated state rebuild through the provided rebuild port.",
	},
	{
		name: "codewiki_artifact_status",
		module: "src/application/tools/artifact-status.ts",
		layer: "coordination",
		summary: "Manage runtime artifact status in the session queue.",
		safeMutationPath: "Runtime coordination only; roadmap truth remains in tasks/sprints/builds/validation/code.",
	},
	{
		name: "codewiki_claim",
		module: "src/application/tools/claim.ts",
		layer: "coordination",
		summary: "Legacy compatibility alias for artifact status.",
		safeMutationPath: "Compatibility runtime coordination only; prefer codewiki_artifact_status.",
	},
	{
		name: "codewiki_audit",
		module: "src/application/tools/audit.ts",
		layer: "validation",
		summary: "Run source-owned audit profiles and return deterministic evidence.",
		safeMutationPath: "Read-only audit evidence; validation gateway decides verdict.",
	},
	{
		name: "codewiki_build",
		module: "src/application/tools/build.ts",
		layer: "compiler",
		summary: "Write feedback, documentation, planning, or implementation build artifacts.",
		safeMutationPath: "Writes transient build artifacts and optionally refreshes generated state.",
	},
	{
		name: "codewiki_validation",
		module: "src/application/tools/validation.ts",
		layer: "validation",
		summary: "Write validation gateway pass/fail/block reports.",
		safeMutationPath: "Writes validation reports; validators do not mutate source/roadmap/build truth.",
	},
	{
		name: "codewiki_gc",
		module: "src/application/tools/gc.ts",
		layer: "gc",
		summary: "Dry-run or purge eligible CodeWiki artifacts after archive commit proof and restore-ledger emission.",
		safeMutationPath: "Tracked purge requires archive_sha/tree_sha, writes a restore ledger first, and runs after the archive/close/publication commit; runtime cleanup is scoped to ignored session-boundary artifacts.",
	},
	{
		name: "codewiki_task",
		module: "src/application/tools/task.ts",
		layer: "roadmap",
		summary: "Mutate roadmap task truth and sprint metadata through one safe application contract.",
		safeMutationPath: "Tasks use create/update/close/cancel/checkpoint actions; sprint metadata uses action='sprint' with sprint input instead of hand-editing roadmap JSON.",
	},
	{
		name: "codewiki_diff_table",
		module: "src/application/tools/diff-table.ts",
		layer: "compiler",
		summary: "Manage pending semantic diff rows before accepted feedback builds.",
		safeMutationPath: "Writes pending feedback diff state only; accepted rows compile into feedback builds.",
	},
	{
		name: "codewiki_session",
		module: "src/application/tools/session.ts",
		layer: "session",
		summary: "Manage runtime session focus and notes through injected session ports.",
		safeMutationPath: "Runtime focus only; canonical roadmap truth stays in codewiki_task.",
	},
	{
		name: "codewiki_session_handoff",
		module: "src/application/tools/session-handoff.ts",
		layer: "session",
		summary: "Compatibility surface for staging new_session/context_refresh boundaries or true role handoffs from durable refs.",
		safeMutationPath: "Writes runtime boundary files and lets command context perform new_session/context_refresh execution.",
	},
	{
		name: "codewiki_agency",
		module: "src/application/tools/agency.ts",
		layer: "agency",
		summary: "Plan bounded CodeWiki observe/maintain/work cycles.",
		safeMutationPath: "Planning-only; parent agent owns canonical writes and publication.",
	},
] as const satisfies readonly CodewikiToolContract[];

export type CodewikiToolName = typeof CODEWIKI_TOOL_CONTRACTS[number]["name"];

export function codewikiToolContractNames(): CodewikiToolName[] {
	return CODEWIKI_TOOL_CONTRACTS.map((contract) => contract.name);
}

export function getCodewikiToolContract(name: string): CodewikiToolContract | undefined {
	return CODEWIKI_TOOL_CONTRACTS.find((contract) => contract.name === name);
}
