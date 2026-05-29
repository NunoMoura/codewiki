#!/usr/bin/env node
import "../setup-env.mjs";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path, { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const repoRoot = resolve(import.meta.dirname, "..", "..");
const require = createRequire(import.meta.url);

function findPiRoot() {
	const candidates = [
		process.env.PI_CODING_AGENT_ROOT,
		resolve(repoRoot, "node_modules", "@earendil-works", "pi-coding-agent"),
	].filter(Boolean);
	for (const candidate of candidates) {
		if (candidate && existsSync(resolve(candidate, "dist", "index.js")))
			return candidate;
	}
	const globalRoot = execFileSync("npm", ["root", "-g"], {
		encoding: "utf8",
	}).trim();
	const candidate = resolve(globalRoot, "@earendil-works", "pi-coding-agent");
	if (existsSync(resolve(candidate, "dist", "index.js"))) return candidate;
	throw new Error("Unable to locate @earendil-works/pi-coding-agent.");
}

function extendNodePath(piRoot) {
	const entries = [
		resolve(repoRoot, "node_modules"),
		resolve(piRoot, "node_modules"),
		resolve(piRoot, "..", ".."),
	].filter(existsSync);
	const existing =
		process.env.NODE_PATH?.split(path.delimiter).filter(Boolean) ?? [];
	process.env.NODE_PATH = [...new Set([...entries, ...existing])].join(
		path.delimiter,
	);
	require("node:module").Module._initPaths();
}

async function main() {
	const piRoot = findPiRoot();
	extendNodePath(piRoot);
	const { DefaultResourceLoader, initTheme, getAgentDir } = await import(
		pathToFileURL(resolve(piRoot, "dist", "index.js")).href
	);
	initTheme("dark", false);

	const projectDir = mkdtempSync(resolve(tmpdir(), "codewiki-audit-loader-"));
	try {
		mkdirSync(resolve(projectDir, ".pi"), { recursive: true });
		writeFileSync(
			resolve(projectDir, ".pi", "settings.json"),
			JSON.stringify({ packages: [repoRoot] }, null, 2),
		);
		const loader = new DefaultResourceLoader({
			cwd: projectDir,
			agentDir: getAgentDir(),
		});
		await loader.reload();
		const extension = loader
			.getExtensions()
			.extensions.find((item) => item.path.startsWith(repoRoot));
		assert.ok(
			extension,
			"CodeWiki extension should load from package settings",
		);

		const auditTool = extension.tools.get("codewiki_audit");
		assert.ok(auditTool, "codewiki_audit tool should be registered");
		const ctx = {
			cwd: repoRoot,
			sessionManager: {
				getSessionId: () => "audit-smoke-session",
				getSessionFile: () =>
					resolve(projectDir, ".pi", "sessions", "audit-smoke-session.jsonl"),
				getSessionName: () => "Audit smoke session",
				getEntries: () => [],
				getBranch: () => [],
			},
			ui: { setStatus: () => {}, setWidget: () => {}, notify: () => {} },
		};

		const full = await auditTool.definition.execute(
			"audit-full",
			{ repoPath: repoRoot, include_fingerprints: false },
			undefined,
			undefined,
			ctx,
		);
		assert.equal(full.details.report.kind, "audit_report");
		for (const profile of [
			"alignment",
			"horizontal-alignment",
			"file-structure",
			"stale-reference",
			"package",
			"security",
			"generated-parity",
		]) {
			assert.ok(
				full.details.report.profiles.includes(profile),
				`full audit missing ${profile}`,
			);
		}
		assert.ok(
			Array.isArray(full.details.report.issues),
			"audit report should expose machine-readable issues",
		);
		assert.ok(
			Array.isArray(full.details.report.evidence_refs),
			"audit report should expose evidence refs",
		);

		for (const profile of ["file-structure", "security", "package"]) {
			const result = await auditTool.definition.execute(
				`audit-${profile}`,
				{
					repoPath: repoRoot,
					profiles: [profile],
					include_fingerprints: profile === "package",
				},
				undefined,
				undefined,
				ctx,
			);
			assert.deepEqual(
				result.details.report.profiles,
				[profile],
				`${profile} audit should be scoped`,
			);
			assert.equal(result.details.report.profile_results[0].profile, profile);
			assert.ok(
				result.details.summary.includes(profile),
				`${profile} summary should be human-readable`,
			);
			if (profile === "package") {
				assert.ok(
					result.details.report.fingerprints.some(
						(item) =>
							item.path === "package.json" && item.digest.startsWith("sha256:"),
					),
					"package audit should fingerprint package.json",
				);
			}
		}

		const notifications = [];
		const auditCommand = extension.commands.get("audit");
		assert.ok(auditCommand, "/audit command should be registered");
		await auditCommand.handler(`--file-structure ${repoRoot}`, {
			cwd: repoRoot,
			sessionManager: ctx.sessionManager,
			ui: {
				setStatus: () => {},
				setWidget: () => {},
				notify: (message, level) => notifications.push({ message, level }),
			},
		});
		assert.ok(
			notifications.some((item) =>
				String(item.message).includes("file-structure"),
			),
			"/audit --file-structure should print file-structure result",
		);
	} finally {
		rmSync(projectDir, { recursive: true, force: true });
	}
}

main().then(() => console.log("✓ audit smoke passed"));
