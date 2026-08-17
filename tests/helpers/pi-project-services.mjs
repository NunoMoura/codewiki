import { ProjectServerReactor } from "../../src/project-server/coordinator/reactor.ts";
import {
	closeCodewikiAppServer,
	closeInProcessCodewikiAppServer,
	startCodewikiAppServer,
} from "../../src/project-server/app/server.ts";
import {
	closePiPreviewRuntime,
	piPreviewControl,
} from "../../src/clients/pi/preview-project-server.ts";

export function testPiDashboardService(projectServices) {
	return {
		start(input) {
			return startCodewikiAppServer({
				...input,
				inProcess: true,
				persistent: false,
				previewControl: piPreviewControl(input.repoRoot),
				connectProjectServer: false,
			});
		},
		async stop(repoRoot) {
			await closeCodewikiAppServer(repoRoot);
			await projectServices.stop(repoRoot).catch(() => undefined);
		},
		async shutdown(repoRoot) {
			await Promise.all([
				closeInProcessCodewikiAppServer(repoRoot),
				closePiPreviewRuntime(repoRoot),
			]);
		},
	};
}

export function testPiProjectServices() {
	const reactors = new Map();
	const reactorFor = (root) => {
		const current = reactors.get(root);
		if (current) return current;
		const reactor = new ProjectServerReactor(root);
		reactors.set(root, reactor);
		return reactor;
	};
	return {
		inspect(root, _ctx, trigger) {
			return reactorFor(root).inspect(trigger);
		},
		async decisionAttention() {
			throw new Error("decision_attention_projection_unavailable");
		},
		async selectDecision() {
			throw new Error("decision_attention_selection_unavailable");
		},
		async stop() {},
		async disconnect() {},
	};
}
