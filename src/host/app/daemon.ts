import { startCodewikiDashboardServer } from "../../dashboard/server.ts";

const repoRoot = process.argv[2];

if (!repoRoot) {
	throw new Error("CodeWiki App daemon requires a repo root argument.");
}

await startCodewikiDashboardServer({
	repoRoot,
	open: false,
	keepAlive: true,
	inProcess: true,
	projectCoordinatorClient: true,
});
