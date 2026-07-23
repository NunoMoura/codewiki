import { createHash } from "node:crypto";
import type { RuntimeReaction } from "./reactor.ts";

export function runtimeSemanticJobId(
	reaction: RuntimeReaction,
	mode: "append" | "preview" = "append",
): string {
	const digest = createHash("sha256")
		.update(
			JSON.stringify({
				schemaVersion: reaction.schemaVersion,
				mode,
				observedWorkStateDigest: reaction.observedWorkStateDigest,
				selection: reaction.selection,
			}),
		)
		.digest("hex");
	return `runtime-reaction:${digest}`;
}
