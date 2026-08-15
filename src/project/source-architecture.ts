export const CURRENT_SOURCE_ROOTS = [
	"alignment",
	"changes",
	"checks",
	"clients",
	"error-handling",
	"evidence",
	"execution",
	"git",
	"knowledge",
	"loops",
	"preview",
	"project",
	"protocol",
	"runtime",
	"server",
	"utils",
	"work-state",
] as const;

export const TARGET_SOURCE_ROOTS = [...CURRENT_SOURCE_ROOTS] as const;

export const TARGET_RUNTIME_SUBDIRECTORIES = [
	"admission",
	"authorization",
	"claims",
	"commands",
	"coordinator",
	"effects",
	"integration",
	"lifecycle",
	"persistence",
	"queries",
	"recovery",
	"synchronization",
	"workbenches",
	"workers",
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
	"execution",
	"preview",
	"protocol",
	"server",
] as const;

export const LEGACY_SOURCE_FILE_COUNTS = {} as const;

export const FORBIDDEN_RUNTIME_SUBDIRECTORIES = [
	"decision",
	"planning",
	"implementation",
] as const;

export const IMPORT_CYCLE_BASELINE = [
	"src/evidence/obligation-resolution.ts | src/evidence/obligations.ts",
	"src/git/worktrees.ts | src/runtime/claims/work-unit-selection.ts",
	"src/execution/review/evidence-report.ts | src/loops/implementation/types.ts | src/loops/implementation/worker-proof.ts",
] as const;
