#!/usr/bin/env node
import { loadProject } from "../src/application/project.ts";
import { executeCodewikiAudit, formatAuditReport } from "../src/audit/tool.ts";

try {
	const project = await loadProject(process.cwd());
	const report = await executeCodewikiAudit(project, {
		profiles: ["file-structure"],
		include_fingerprints: false,
	});
	console.log(formatAuditReport(report));
	if (report.status === "fail") process.exit(1);
} catch (error) {
	console.error(error instanceof Error ? error.message : String(error));
	process.exit(1);
}
