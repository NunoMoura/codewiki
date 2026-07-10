import { startCodewikiDashboardServer } from "./server.ts";

const repoRoot = process.argv[2];

if (!repoRoot) {
	console.error("CodeWiki dashboard daemon requires a repo root argument.");
	process.exit(1);
}

await startCodewikiDashboardServer({
	repoRoot,
	open: false,
	keepAlive: true,
	inProcess: true,
});
