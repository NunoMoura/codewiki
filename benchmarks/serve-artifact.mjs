#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import {
	createReadStream,
	existsSync,
	readdirSync,
	readFileSync,
	rmSync,
} from "node:fs";
import { mkdir } from "node:fs/promises";
import { createServer as createHttpServer } from "node:http";
import { createServer as createNetServer } from "node:net";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_ARTIFACTS_DIR = "benchmarks/artifacts";
const DEFAULT_WORK_DIR = "benchmarks/.serve";
const DEFAULT_PORT = 4173;

const CONTENT_TYPES = {
	".css": "text/css; charset=utf-8",
	".html": "text/html; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".svg": "image/svg+xml; charset=utf-8",
	".txt": "text/plain; charset=utf-8",
};

export function artifactRunIds(artifactsDir = DEFAULT_ARTIFACTS_DIR) {
	if (!existsSync(artifactsDir)) return [];
	return readdirSync(artifactsDir, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name)
		.filter((runId) => existsSync(join(artifactsDir, runId, "source.tgz")))
		.sort();
}

export function selectRunId(requestedRunId, runIds) {
	if (runIds.length === 0) {
		throw new Error("No benchmark artifact source.tgz files found.");
	}
	if (!requestedRunId || requestedRunId === "latest") return runIds.at(-1);
	if (runIds.includes(requestedRunId)) return requestedRunId;
	throw new Error(
		`Unknown benchmark run ${requestedRunId}. Available runs:\n${runIds.join("\n")}`,
	);
}

export function parseArgs(argv) {
	const options = {
		runId: undefined,
		artifactsDir: DEFAULT_ARTIFACTS_DIR,
		workDir: DEFAULT_WORK_DIR,
		port: DEFAULT_PORT,
		list: false,
		install: false,
	};
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (arg === "--list") {
			options.list = true;
		} else if (arg === "--install") {
			options.install = true;
		} else if (arg === "--artifacts") {
			options.artifactsDir = argv[++index];
		} else if (arg === "--work-dir") {
			options.workDir = argv[++index];
		} else if (arg === "--port") {
			options.port = Number(argv[++index]);
		} else if (!arg.startsWith("--") && !options.runId) {
			options.runId = arg;
		} else {
			throw new Error(`Unknown argument: ${arg}`);
		}
	}
	if (!Number.isInteger(options.port) || options.port < 1 || options.port > 65535) {
		throw new Error("--port must be an integer from 1 to 65535");
	}
	return options;
}

export function npmStartAvailable(projectDir) {
	const packagePath = join(projectDir, "package.json");
	if (!existsSync(packagePath)) return false;
	const manifest = JSON.parse(readFileSync(packagePath, "utf8"));
	return typeof manifest.scripts?.start === "string";
}

export function hasDependencies(projectDir) {
	const packagePath = join(projectDir, "package.json");
	if (!existsSync(packagePath)) return false;
	const manifest = JSON.parse(readFileSync(packagePath, "utf8"));
	return Boolean(
		Object.keys(manifest.dependencies || {}).length ||
			Object.keys(manifest.devDependencies || {}).length,
	);
}

async function extractArtifact({ artifactsDir, workDir, runId }) {
	const source = join(artifactsDir, runId, "source.tgz");
	if (!existsSync(source)) throw new Error(`Missing artifact source: ${source}`);
	const target = join(workDir, runId);
	rmSync(target, { recursive: true, force: true });
	await mkdir(target, { recursive: true });
	const tar = spawnSync("tar", ["-xzf", resolve(source), "-C", target], {
		encoding: "utf8",
	});
	if (tar.status !== 0) {
		throw new Error(`Failed to extract ${source}\n${tar.stderr}`);
	}
	return target;
}

function installDependencies(projectDir) {
	const install = spawnSync("npm", ["install", "--ignore-scripts"], {
		cwd: projectDir,
		stdio: "inherit",
	});
	if (install.status !== 0) {
		throw new Error("npm install failed for benchmark artifact.");
	}
}

export async function findAvailablePort(startPort) {
	for (let port = startPort; port < startPort + 100; port += 1) {
		if (await isPortAvailable(port)) return port;
	}
	throw new Error(`No available localhost port found from ${startPort}.`);
}

function isPortAvailable(port) {
	return new Promise((resolveAvailability) => {
		const server = createNetServer();
		server.once("error", () => resolveAvailability(false));
		server.once("listening", () =>
			server.close(() => resolveAvailability(true)),
		);
		server.listen(port, "127.0.0.1");
	});
}

function runNpmStart(projectDir, port) {
	const child = spawn("npm", ["start"], {
		cwd: projectDir,
		env: { ...process.env, PORT: String(port) },
		stdio: "inherit",
	});
	process.on("SIGINT", () => child.kill("SIGINT"));
	process.on("SIGTERM", () => child.kill("SIGTERM"));
	child.on("exit", (code, signal) => {
		if (signal) process.kill(process.pid, signal);
		process.exitCode = code ?? 1;
	});
}

function safeStaticPath(root, urlPath) {
	const decoded = decodeURIComponent(urlPath.split("?")[0] || "/");
	const relative = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
	const candidate = normalize(resolve(root, relative));
	const rootWithSep = `${resolve(root)}${sep}`;
	if (!candidate.startsWith(rootWithSep)) return undefined;
	return candidate;
}

function runStaticServer(projectDir, port) {
	const server = createHttpServer((request, response) => {
		const filePath = safeStaticPath(projectDir, request.url || "/");
		if (!filePath || !existsSync(filePath)) {
			response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
			response.end("Not found\n");
			return;
		}
		response.writeHead(200, {
			"content-type": CONTENT_TYPES[extname(filePath)] || "application/octet-stream",
		});
		createReadStream(filePath).pipe(response);
	});
	server.listen(port, () => {
		console.log(`Serving static artifact at http://localhost:${port}`);
		console.log(`Extracted path: ${projectDir}`);
	});
}

async function main(argv = process.argv.slice(2)) {
	const options = parseArgs(argv);
	const runIds = artifactRunIds(options.artifactsDir);
	if (options.list) {
		console.log(runIds.join("\n"));
		return;
	}
	const runId = selectRunId(options.runId, runIds);
	const port = await findAvailablePort(options.port);
	const projectDir = await extractArtifact({
		artifactsDir: options.artifactsDir,
		workDir: options.workDir,
		runId,
	});
	console.log(`Run: ${runId}`);
	console.log(`Open: http://localhost:${port}`);
	if (port !== options.port) {
		console.log(`Port ${options.port} was busy; using ${port}.`);
	}
	console.log(`Extracted: ${projectDir}`);
	if (options.install && hasDependencies(projectDir)) installDependencies(projectDir);
	if (npmStartAvailable(projectDir)) {
		runNpmStart(projectDir, port);
	} else {
		runStaticServer(projectDir, port);
	}
}

const entryPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (entryPath === fileURLToPath(import.meta.url)) {
	main().catch((error) => {
		console.error(error.message);
		process.exitCode = 1;
	});
}
