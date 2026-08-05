export const CURRENT_SOURCE_ROOTS = [
	"api",
	"benchmarks",
	"change-trace",
	"changes",
	"cli",
	"dashboard",
	"decision",
	"error-handling",
	"evidence",
	"git",
	"implementation",
	"knowledge",
	"loop-exit",
	"loops",
	"pi",
	"planning",
	"preview",
	"project",
	"runtime",
	"traces",
	"utils",
	"views",
	"work-state",
] as const;

export const TARGET_SOURCE_ROOTS = [
	"api",
	"benchmarks",
	"changes",
	"cli",
	"dashboard",
	"decision",
	"error-handling",
	"evidence",
	"git",
	"implementation",
	"knowledge",
	"pi",
	"planning",
	"preview",
	"project",
	"runtime",
	"utils",
	"verification",
	"work-state",
	"alignment",
] as const;

export const LEGACY_SOURCE_ROOTS = [
	"change-trace",
	"loop-exit",
	"loops",
	"traces",
	"views",
] as const;

export const CORE_SOURCE_ROOTS = [
	"change-trace",
	"changes",
	"evidence",
	"loop-exit",
] as const;

export const OUTER_ADAPTER_SOURCE_ROOTS = [
	"api",
	"cli",
	"dashboard",
	"pi",
	"preview",
] as const;

export const LEGACY_SOURCE_FILE_COUNTS = {
	"change-trace": 19,
	"loop-exit": 34,
	loops: 10,
	traces: 12,
	views: 13,
} as const;

export const FORBIDDEN_RUNTIME_SUBDIRECTORIES = [
	"decision",
	"planning",
	"implementation",
	"loop-exit",
] as const;

export const RUNTIME_TO_PI_IMPORT_BASELINE = [
	"src/runtime/handoff.ts -> src/pi/worker-start.ts",
	"src/runtime/host-runner.ts -> src/pi/worker-reports.ts",
	"src/runtime/host-runner.ts -> src/pi/worker-start.ts",
] as const;

export const IMPORT_CYCLE_BASELINE = [
	"src/evidence/obligation-resolution.ts | src/evidence/obligations.ts",
	"src/git/worktrees.ts | src/runtime/work-unit-claim-selection.ts",
	"src/implementation/review/evidence-report.ts | src/implementation/types.ts | src/implementation/worker-proof.ts",
	"src/loop-exit/catalog.ts | src/loop-exit/runner.ts | src/loop-exit/security-scanner-checks.ts",
	"src/loop-exit/contracts.ts | src/loop-exit/identity.ts",
	"src/pi/process-session.ts | src/pi/trace-host-process.ts",
] as const;
