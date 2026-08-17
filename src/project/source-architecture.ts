export const CURRENT_SOURCE_ROOTS = [
	"alignment",
	"changes",
	"checks",
	"clients",
	"error-handling",
	"evidence",
	"git",
	"knowledge",
	"loops",
	"preview",
	"project",
	"project-server",
	"protocol",
	"runtime",
	"utils",
	"work-state",
] as const;

export const TARGET_SOURCE_ROOTS = [...CURRENT_SOURCE_ROOTS] as const;

export const TARGET_PROJECT_SERVER_SUBDIRECTORIES = [
	"admission",
	"app",
	"authentication",
	"claims",
	"commands",
	"coordinator",
	"effects",
	"integration",
	"lifecycle",
	"pairing",
	"persistence",
	"queries",
	"registry",
	"repository-access",
	"sessions",
	"workbenches",
	"workers",
] as const;

export const TARGET_RUNTIME_SUBDIRECTORIES = [
	"builds",
	"checks",
	"dsh",
	"pi",
	"processes",
	"review",
	"security",
] as const;

export const LEGACY_SOURCE_ROOTS = [] as const;

export const LEGACY_SOURCE_FILES = [] as const;

export const CORE_SOURCE_ROOTS = [
	"alignment",
	"changes",
	"checks",
	"evidence",
] as const;

export const OUTER_ADAPTER_SOURCE_ROOTS = [
	"clients",
	"preview",
	"project-server",
	"protocol",
	"runtime",
] as const;

export const FORBIDDEN_PROJECT_SERVER_SUBDIRECTORIES = [
	"decision",
	"planning",
	"implementation",
] as const;

export const IMPORT_CYCLE_BASELINE = [
	"src/evidence/obligation-resolution.ts | src/evidence/obligations.ts",
	"src/git/worktrees.ts | src/project-server/claims/work-unit-selection.ts",
	"src/loops/implementation/types.ts | src/loops/implementation/worker-proof.ts | src/runtime/review/evidence-report.ts",
] as const;
