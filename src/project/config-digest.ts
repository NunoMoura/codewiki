import {canonicalJsonDigest, type Sha256Digest} from "../utils/canonical-json.ts";
import {resolveWikiConfig, type WikiConfig} from "./config.ts";

export function wikiConfigDigest(config: WikiConfig): Sha256Digest {
	return canonicalJsonDigest(resolveWikiConfig(config));
}
