import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const testsRoot = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(testsRoot, "..");
const fallbackTmpRoot = resolve(
	repoRoot,
	".codewiki",
	"runtime",
	"tmp",
	"tests",
);
const testTmpRoot = process.env.CODEWIKI_TEST_TMPDIR || fallbackTmpRoot;

mkdirSync(testTmpRoot, { recursive: true });

if (!process.env.PI_CODEWIKI_STATUS_PREFS_PATH) {
	process.env.PI_CODEWIKI_STATUS_PREFS_PATH = resolve(
		testTmpRoot,
		"codewiki-status-prefs.json",
	);
}

for (const name of ["TMPDIR", "TMP", "TEMP"]) {
	process.env[name] = testTmpRoot;
}

const stripTypesFlag = "--experimental-strip-types";
const nodeOptions =
	process.env.NODE_OPTIONS?.split(/\s+/).filter(Boolean) ?? [];
if (nodeOptions.includes(stripTypesFlag) === false) {
	process.env.NODE_OPTIONS = [...nodeOptions, stripTypesFlag].join(" ").trim();
}
