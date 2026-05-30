import "../../setup-env.mjs";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(import.meta.dirname, "..", "..", "..");
const thisTest = relative(repoRoot, fileURLToPath(import.meta.url)).replaceAll("\\", "/");

const requiredPaths = [
	"src/build/types.ts",
	"src/build/lifecycle.ts",
	"src/build/decision-propagation.ts",
	"src/build/writer.ts",
	"src/build/tool.ts",
	"src/gateway/types.ts",
	"src/gateway/preflight.ts",
	"src/gateway/report.ts",
	"src/gateway/tool.ts",
	"src/gateway/index.ts",
	"src/gateway/transaction.ts",
];

for (const path of requiredPaths) {
	assert.ok(existsSync(resolve(repoRoot, path)), `TASK-022 owner path missing: ${path}`);
}

const validationShimPaths = [
	"src/validation/index.ts",
	"src/validation/preflight.ts",
	"src/validation/report.ts",
	"src/validation/tool.ts",
	"src/validation/types.ts",
];

for (const path of validationShimPaths) {
	const source = readFileSync(resolve(repoRoot, path), "utf8");
	assert.match(source, /@deprecated|compatibility/i, `Validation shim must be documented as compatibility-only: ${path}`);
	assert.match(source, /\.\.\/gateway\//, `Validation shim must re-export from src/gateway: ${path}`);
	assert.equal(source.includes("from \"./"), false, `Validation shim must not own local behavior: ${path}`);
}

const removedPaths = [
	"src/domain/build",
	"src/domain/validation",
	"src/application/builds.ts",
	"src/application/tools/build.ts",
	"src/application/tools/validation.ts",
	"src/application/gateway",
];

for (const path of removedPaths) {
	assert.equal(existsSync(resolve(repoRoot, path)), false, `Legacy build/validation/gateway owner path remains: ${path}`);
}

const legacyImportFragments = [
	"domain/build/",
	"domain/validation/",
	"application/builds.ts",
	"application/tools/build.ts",
	"application/tools/validation.ts",
	"application/gateway/",
];

for (const file of walkTextFiles(["src", "scripts", "tests"])) {
	const rel = relative(repoRoot, file).replaceAll("\\", "/");
	if (rel === thisTest) continue;
	const text = readFileSync(file, "utf8");
	for (const fragment of legacyImportFragments) {
		assert.equal(text.includes(fragment), false, `${rel} still references legacy build/validation/gateway owner fragment ${fragment}`);
	}
}

const adapterSource = readFileSync(resolve(repoRoot, "src/adapters/pi/index.ts"), "utf8");
assert.match(adapterSource, /from "\.\.\/\.\.\/api\/tools\.ts"/, "Pi adapter must call wiki_build/wiki_gateway through src/api/tools.ts");
const apiFacadeSource = readFileSync(resolve(repoRoot, "src/api/tools.ts"), "utf8");
assert.match(apiFacadeSource, /build\/tool\.ts/, "API facade must expose wiki_build from src/build/tool.ts");
assert.match(apiFacadeSource, /gateway\/tool\.ts/, "API facade must expose wiki_gateway from src/gateway/tool.ts");
assert.equal(apiFacadeSource.includes("validation/tool.ts"), false, "API facade must not import the validation compatibility shim");

const gatewayScript = readFileSync(resolve(repoRoot, "scripts/codewiki-gateway.mjs"), "utf8");
assert.match(gatewayScript, /src\/gateway\/index\.ts/, "Gateway script must use src/gateway/index.ts owner path");

console.log("✓ TASK-022 build/validation/gateway source-root ownership test passed");

function walkTextFiles(roots) {
	return roots.flatMap((root) => {
		const abs = resolve(repoRoot, root);
		return existsSync(abs) ? walk(abs) : [];
	});
}

function walk(dir) {
	const out = [];
	for (const entry of readdirSync(dir)) {
		const abs = resolve(dir, entry);
		const stat = statSync(abs);
		if (stat.isDirectory()) {
			if (["node_modules", ".git"].includes(entry)) continue;
			out.push(...walk(abs));
		} else if (/\.(?:ts|mjs|js)$/.test(entry)) {
			out.push(abs);
		}
	}
	return out;
}
