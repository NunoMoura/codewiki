import { mkdirSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { resolve } from "node:path";

const home = process.env.HOME || homedir();
const fallbackTmpRoot = home
	? resolve(home, ".cache", "codewiki-tests")
	: resolve(tmpdir(), "codewiki-tests");
const testTmpRoot = process.env.CODEWIKI_TEST_TMPDIR || fallbackTmpRoot;

mkdirSync(testTmpRoot, { recursive: true });

for (const name of ["TMPDIR", "TMP", "TEMP"]) {
	if (Boolean(process.env[name]) === false || process.env[name] === "/tmp") {
		process.env[name] = testTmpRoot;
	}
}

const stripTypesFlag = "--experimental-strip-types";
const nodeOptions = process.env.NODE_OPTIONS?.split(/\s+/).filter(Boolean) ?? [];
if (nodeOptions.includes(stripTypesFlag) === false) {
	process.env.NODE_OPTIONS = [...nodeOptions, stripTypesFlag].join(" ").trim();
}
