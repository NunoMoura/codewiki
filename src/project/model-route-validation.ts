import {
	resolveWikiModelRoutingConfig,
	type WikiModelRouteConfig,
} from "./model-routing.ts";

export function validateNoToolModelRoute(
	route: WikiModelRouteConfig,
	label: string,
): WikiModelRouteConfig {
	const routing = resolveWikiModelRoutingConfig({
		qualityFloor: route.quality,
		routes: [route],
	});
	const [validated] = routing.routes;
	if (routing.routes.length !== 1 || validated.allowedTools[0] !== undefined) {
		throw new Error(`${label} route must disable all tools.`);
	}
	return validated;
}
