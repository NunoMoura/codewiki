import type { BootstrapOptions, BootstrapResult } from "./bootstrap.ts";

export interface CodewikiBootstrapToolInput {
	repoPath?: string;
	projectName?: string;
	force?: boolean;
}

export interface CodewikiBootstrapToolContext {
	cwd: string;
}

export interface CodewikiBootstrapToolPorts {
	resolveStartDir(cwd: string, repoPath?: string): string;
	setup(startDir: string, options: Omit<BootstrapOptions, "force">): Promise<BootstrapResult>;
	bootstrap(startDir: string, options: BootstrapOptions): Promise<BootstrapResult>;
	format(action: string, result: BootstrapResult): string;
}

export async function executeCodewikiSetupTool(
	input: CodewikiBootstrapToolInput,
	context: CodewikiBootstrapToolContext,
	ports: CodewikiBootstrapToolPorts,
) {
	const result = await ports.setup(ports.resolveStartDir(context.cwd, input.repoPath), {
		projectName: input.projectName,
	});
	return {
		content: [{ type: "text", text: ports.format("Configured", result) }],
		details: result,
	};
}

export async function executeCodewikiBootstrapTool(
	input: CodewikiBootstrapToolInput,
	context: CodewikiBootstrapToolContext,
	ports: CodewikiBootstrapToolPorts,
) {
	const result = await ports.bootstrap(ports.resolveStartDir(context.cwd, input.repoPath), {
		projectName: input.projectName,
		force: input.force ?? false,
	});
	return {
		content: [{ type: "text", text: ports.format("Bootstrapped", result) }],
		details: result,
	};
}
