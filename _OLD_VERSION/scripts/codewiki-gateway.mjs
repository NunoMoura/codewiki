#!/usr/bin/env node

async function loadGatewayMain() {
	try {
		const mod = await import("../src/gateway/index.ts");
		return mod.gatewayMain;
	} catch (error) {
		const code = String(error?.code || "");
		if (code === "ERR_UNKNOWN_FILE_EXTENSION" || code === "ERR_MODULE_NOT_FOUND") {
			throw new Error(
				"Unable to load TypeScript gateway source in this Node runtime. Use Pi's package loader or run with an explicit, pinned TypeScript loader; refusing network npx fallback.",
			);
		}
		throw error;
	}
}

try {
	const gatewayMain = await loadGatewayMain();
	const output = await gatewayMain(process.argv.slice(2));
	if (output !== undefined) console.log(output);
} catch (error) {
	console.error(error?.stack || error?.message || String(error));
	process.exit(1);
}
