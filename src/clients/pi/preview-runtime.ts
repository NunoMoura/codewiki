import {
	createDashboardPreviewControl,
	type DashboardPreviewControl,
} from "../../preview/dashboard-control.ts";
import {
	createPreviewCoordinator,
	type PreviewCoordinator,
} from "../../preview/coordinator.ts";

interface PiPreviewRuntime {
	control: DashboardPreviewControl;
	coordinator: PreviewCoordinator;
}

const runtimes = new Map<string, PiPreviewRuntime>();

export function piPreviewControl(repoRoot: string): DashboardPreviewControl {
	const current = runtimes.get(repoRoot);
	if (current) return current.control;
	const coordinator = createPreviewCoordinator(repoRoot);
	const runtime = {
		coordinator,
		control: createDashboardPreviewControl(coordinator),
	};
	runtimes.set(repoRoot, runtime);
	return runtime.control;
}

export async function closePiPreviewRuntime(repoRoot: string): Promise<void> {
	const runtime = runtimes.get(repoRoot);
	if (!runtime) return;
	runtimes.delete(repoRoot);
	await runtime.coordinator.close();
}
