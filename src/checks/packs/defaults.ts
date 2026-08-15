import {CHECK_STAGES, type CheckStage} from "../contracts.ts";

export const DEFAULT_CHECK_PACK_ID = "default" as const;

export interface DefaultCheckPackDirectory {
	readonly stage: CheckStage;
	readonly packId: typeof DEFAULT_CHECK_PACK_ID;
	readonly relativePath: string;
}

export function defaultCheckPackDirectories(): readonly DefaultCheckPackDirectory[] {
	return Object.freeze(
		CHECK_STAGES.map((stage) =>
			Object.freeze({
				stage,
				packId: DEFAULT_CHECK_PACK_ID,
				relativePath: `.codewiki/check-packs/${stage}/${DEFAULT_CHECK_PACK_ID}`,
			}),
		),
	);
}
