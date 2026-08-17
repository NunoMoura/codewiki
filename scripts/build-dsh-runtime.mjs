import {mkdir, readFile} from "node:fs/promises";
import {dirname, resolve} from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";

import {build} from "esbuild";

const repositoryRoot = resolve(
	dirname(fileURLToPath(import.meta.url)),
	"..",
);

export async function buildDshRuntimeCandidate({outfile} = {}) {
	const outputPath = resolve(
		outfile ?? resolve(repositoryRoot, "dist/runtime-builds/dsh-replay-run-process.mjs"),
	);
	await mkdir(dirname(outputPath), {recursive: true});
	const result = await build({
		absWorkingDir: repositoryRoot,
		entryPoints: ["src/runtime/processes/dsh-run-process.ts"],
		outfile: outputPath,
		bundle: true,
		platform: "node",
		format: "esm",
		target: "node24",
		packages: "bundle",
		sourcemap: false,
		legalComments: "inline",
		minify: false,
		plugins: [inlineDshPackageVersion()],
		metafile: true,
		logLevel: "silent",
	});
	return Object.freeze({
		artifactPath: outputPath,
		inputPaths: Object.freeze(Object.keys(result.metafile.inputs).sort()),
	});
}

function inlineDshPackageVersion() {
	return {
		name: "codewiki-inline-dsh-package-version",
		setup(buildContext) {
			buildContext.onLoad(
				{filter: /node_modules[\\/]@deepseek-ai[\\/]dsh-llm[\\/]lib[\\/]index\.js$/},
				async ({path}) => {
					const source = await readFile(path, "utf8");
					const packageVersion = dshPackageVersion(
						await readFile(resolve(dirname(path), "../package.json"), "utf8"),
					);
					if (packageVersion !== "0.1.0-rc.6") {
						throw new Error("DSH LLM package version is not the qualified pin.");
					}
					const statement =
						'const { version } = createRequire(import.meta.url)("../package.json");';
					if (source.split(statement).length !== 2) {
						throw new Error("DSH LLM package version statement changed.");
					}
					return {
						contents: source.replace(
							statement,
							'const version = "0.1.0-rc.6";',
						),
						loader: "js",
					};
				},
			);
		},
	};
}

function dshPackageVersion(document) {
	let parsed;
	try {
		parsed = JSON.parse(document);
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		throw new Error(`DSH package metadata is invalid: ${reason}`);
	}
	if (!parsed || typeof parsed !== "object" || typeof parsed.version !== "string") {
		throw new Error("DSH package metadata has no version.");
	}
	return parsed.version;
}

const isMain = process.argv[1] !== undefined &&
	pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
	if (process.argv.length > 3) {
		throw new Error("DSH Runtime Build accepts at most one output path.");
	}
	await buildDshRuntimeCandidate({outfile: process.argv[2]});
}
