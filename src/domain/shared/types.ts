/**
 * Compatibility barrel for domain types.
 *
 * New domain code should import from the owning concept module
 * (for example `domain/roadmap/types.ts` or `domain/session/types.ts`).
 * Existing application/adapters may keep this barrel during migration.
 */
export * from "../../agency/types.ts";
export * from "../../audit/types.ts";
export * from "../../build/types.ts";
export * from "../../change/types.ts";
export * from "../gc/types.ts";
export * from "../../project/types.ts";
export * from "../roadmap/types.ts";
export * from "../session/types.ts";
export * from "../state/types.ts";
export * from "../../validation/types.ts";
