import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerPiAdapter } from "./adapters/pi/index.ts";

export * from "./api/index.ts";

export default function codewikiExtension(pi: ExtensionAPI) {
	registerPiAdapter(pi);
}
