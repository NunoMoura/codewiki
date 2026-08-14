export const CURRENT_SOURCE_ROOTS = [
	"alignment",
	"benchmarks",
	"changes",
	"clients",
	"decision",
	"error-handling",
	"evidence",
	"execution",
	"git",
	"implementation",
	"knowledge",
	"verification",
	"planning",
	"preview",
	"project",
	"protocol",
	"runtime",
	"server",
	"utils",
	"work-state",
] as const;

export const TARGET_SOURCE_ROOTS = [
	"alignment",
	"changes",
	"clients",
	"decision",
	"error-handling",
	"evidence",
	"execution",
	"git",
	"implementation",
	"knowledge",
	"planning",
	"preview",
	"project",
	"protocol",
	"runtime",
	"server",
	"utils",
	"verification",
	"work-state",
] as const;

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

export const LEGACY_SOURCE_ROOTS = ["benchmarks"] as const;

export const LEGACY_SOURCE_FILES = [] as const;

export const CORE_SOURCE_ROOTS = [
	"alignment",
	"changes",
	"evidence",
	"verification",
] as const;

export const OUTER_ADAPTER_SOURCE_ROOTS = [
	"clients",
	"execution",
	"preview",
	"protocol",
	"server",
] as const;

export const LEGACY_SOURCE_FILE_COUNTS = {
	benchmarks: 2,
} as const;

export const FORBIDDEN_RUNTIME_SUBDIRECTORIES = [
	"decision",
	"planning",
	"implementation",
	"loop-exit",
] as const;

export const IMPORT_CYCLE_BASELINE = [
	"src/evidence/obligation-resolution.ts | src/evidence/obligations.ts",
	"src/git/worktrees.ts | src/runtime/claims/work-unit-selection.ts",
	"src/implementation/review/evidence-report.ts | src/implementation/types.ts | src/implementation/worker-proof.ts",
	"src/verification/catalog.ts | src/verification/runner.ts | src/verification/security-scanner-checks.ts",
	"src/verification/contracts.ts | src/verification/identity.ts",
] as const;
