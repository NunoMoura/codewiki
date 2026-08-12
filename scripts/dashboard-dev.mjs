import { createHash } from "node:crypto";
import { realpath, stat } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { startCodewikiAppServer } from "../src/host/app/server.ts";
import { openPreviewBrowser } from "../src/preview/browser-adapter.ts";
import { createPreviewCoordinator } from "../src/preview/coordinator.ts";
import { createDashboardPreviewControl } from "../src/preview/dashboard-control.ts";

const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function parseDashboardDevArgs(argv) {
	const options = { browser: "system" };
	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index];
		if (argument === "--help" || argument === "-h")
			return { ...options, help: true };
		if (argument === "--no-open") {
			options.browser = "none";
			continue;
		}
		if (
			argument === "--project" ||
			argument === "--browser" ||
			argument === "--session"
		) {
			const value = argv[index + 1];
			if (!value || value.startsWith("--"))
				throw new Error(`${argument} requires a value.`);
			index += 1;
			if (argument === "--project") options.project = value;
			if (argument === "--browser") options.browser = value;
			if (argument === "--session") options.session = value;
			continue;
		}
		throw new Error(`Unknown dashboard development option: ${argument}`);
	}
	if (!options.project)
		throw new Error("dashboard:dev requires --project <external-project>.");
	if (!["none", "system", "playwright"].includes(options.browser)) {
		throw new Error("--browser must be none, system, or playwright.");
	}
	return options;
}

export function assertExternalProjectRoot(source, project) {
	if (containsPath(source, project) || containsPath(project, source)) {
		throw new Error(
			"Dashboard development project must be outside the CodeWiki source repository.",
		);
	}
}

export async function runDashboardDev(options) {
	const projectRoot = await realDirectory(options.project);
	const canonicalSourceRoot = await realDirectory(sourceRoot);
	assertExternalProjectRoot(canonicalSourceRoot, projectRoot);

	const previewCoordinator = createPreviewCoordinator(projectRoot);
	const dashboard = await startCodewikiAppServer({
		repoRoot: projectRoot,
		open: false,
		keepAlive: true,
		persistent: false,
		inProcess: true,
		previewControl: createDashboardPreviewControl(previewCoordinator),
	}).catch(async (error) => {
		await previewCoordinator.close();
		throw error;
	});
	let devUrl;
	try {
		devUrl = new URL(dashboard.url);
	} catch {
		await dashboard.close();
		await previewCoordinator.close();
		throw new Error("Dashboard server returned an invalid URL.");
	}
	devUrl.searchParams.set("dev", "1");
	const browser = await openPreviewBrowser({
		adapter: options.browser,
		url: devUrl.href,
		sessionId: options.session || previewSessionId(projectRoot),
	}).catch(async (error) => {
		await dashboard.close();
		await previewCoordinator.close();
		throw error;
	});

	console.log(`CodeWiki dashboard development server: ${devUrl.href}`);
	console.log(`Source root: ${canonicalSourceRoot}`);
	console.log(`External project: ${projectRoot}`);
	console.log(
		`Browser adapter: ${browser.adapter}${browser.opened ? " (opened)" : ""}`,
	);
	console.log("Dashboard assets reload automatically. Press Ctrl-C to stop.");

	return {
		browser,
		dashboard,
		projectRoot,
		sourceRoot: canonicalSourceRoot,
		url: devUrl.href,
		close: async () => {
			await browser.close().catch(() => undefined);
			await dashboard.close();
			await previewCoordinator.close();
		},
	};
}

function containsPath(parent, candidate) {
	const path = relative(parent, candidate);
	return (
		path === "" || (!path.startsWith("..") && !resolve(path).startsWith(".."))
	);
}

async function realDirectory(path) {
	const canonical = await realpath(resolve(path));
	if (!(await stat(canonical)).isDirectory())
		throw new Error(`${path} is not a directory.`);
	return canonical;
}

function previewSessionId(projectRoot) {
	const digest = createHash("sha256")
		.update(projectRoot)
		.digest("hex")
		.slice(0, 12);
	return `codewiki-dashboard-${digest}`;
}

function usage() {
	return [
		"Usage: npm run dashboard:dev -- --project <external-project> [options]",
		"",
		"Options:",
		"  --browser <system|playwright|none>  Browser adapter (default: system)",
		"  --session <id>                      Playwright CLI session ID",
		"  --no-open                           Alias for --browser none",
	].join("\n");
}

async function main() {
	const options = parseDashboardDevArgs(process.argv.slice(2));
	if (options.help) {
		console.log(usage());
		return;
	}
	const runtime = await runDashboardDev(options);
	await new Promise((resolveSignal) => {
		process.once("SIGINT", resolveSignal);
		process.once("SIGTERM", resolveSignal);
	});
	await runtime.close();
}

if (
	process.argv[1] &&
	resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
	main().catch((error) => {
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	});
}
