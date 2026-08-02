import {createUserStandardDefinition} from "../../../src/loop-exit/custom-checks/index.ts";

export function createTestUserStandard(overrides = {}) {
	const passage =
		overrides.passage ??
		"Every changed public API must name its accountable owning team.";
	const content = overrides.content ?? `# Company policy\n${passage}`;
	return createUserStandardDefinition({
		name: overrides.name ?? "Company API policy",
		source: {
			kind: "inline",
			mediaType: "text/markdown",
			content,
			observedAt: overrides.observedAt ?? "2026-08-01T12:00:00.000Z",
		},
		passages: [{text: passage}],
	});
}

export function standardRefsFor(standard) {
	return [
		{
			userStandardId: standard.userStandardId,
			standardDigest: standard.standardDigest,
			passageIds: [standard.passages[0].passageId],
		},
	];
}
