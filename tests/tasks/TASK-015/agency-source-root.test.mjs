import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const repoRoot = resolve(import.meta.dirname, "..", "..", "..");
const source = (...parts) => resolve(repoRoot, "src", ...parts);

assert.ok(existsSync(source("agency", "types.ts")), "Agency types should be owned by src/agency/types.ts");
assert.ok(existsSync(source("agency", "planning.ts")), "Agency planning use case should be owned by src/agency/planning.ts");
assert.ok(existsSync(source("agency", "tool.ts")), "Agency tool entrypoint should be owned by src/agency/tool.ts");

const newTypes = await import(pathToFileURL(source("agency", "types.ts")).href);
const oldTypes = await import(pathToFileURL(source("domain", "agency", "types.ts")).href);
assert.equal(oldTypes.AGENCY_MODE_VALUES, newTypes.AGENCY_MODE_VALUES, "Old agency type path should re-export source-root values");
assert.equal(oldTypes.AGENCY_TRIGGER_VALUES, newTypes.AGENCY_TRIGGER_VALUES, "Old agency trigger path should re-export source-root values");
assert.equal(oldTypes.AGENCY_RISK_VALUES, newTypes.AGENCY_RISK_VALUES, "Old agency risk path should re-export source-root values");

const newPlanning = await import(pathToFileURL(source("agency", "planning.ts")).href);
const oldPlanning = await import(pathToFileURL(source("application", "agency.ts")).href);
assert.equal(oldPlanning.planAgency, newPlanning.planAgency, "Old application agency path should re-export source-root planner");

const newTool = await import(pathToFileURL(source("agency", "tool.ts")).href);
const oldTool = await import(pathToFileURL(source("application", "tools", "agency.ts")).href);
assert.equal(oldTool.executeCodewikiAgencyTool, newTool.executeCodewikiAgencyTool, "Old application tool path should re-export source-root tool executor");
assert.equal(oldTool.buildThinkCodeContextPlan, newTool.buildThinkCodeContextPlan, "Old application tool path should re-export source-root context helper");

const typeShim = readFileSync(source("domain", "agency", "types.ts"), "utf8");
assert.match(typeShim, /@deprecated Compatibility shim/, "Old agency type path should be marked as a temporary compatibility shim");
assert.match(typeShim, /export \* from "\.\.\/\.\.\/agency\/types\.ts";/, "Old agency type path should be re-export-only");

const planningShim = readFileSync(source("application", "agency.ts"), "utf8");
assert.match(planningShim, /@deprecated Compatibility shim/, "Old agency planning path should be marked as a temporary compatibility shim");
assert.match(planningShim, /export \* from "\.\.\/agency\/planning\.ts";/, "Old agency planning path should be re-export-only");

const toolShim = readFileSync(source("application", "tools", "agency.ts"), "utf8");
assert.match(toolShim, /@deprecated Compatibility shim/, "Old agency tool path should be marked as a temporary compatibility shim");
assert.match(toolShim, /export \* from "\.\.\/\.\.\/agency\/tool\.ts";/, "Old agency tool path should be re-export-only");

const adapterSource = readFileSync(source("adapters", "pi", "tools", "agency.ts"), "utf8");
assert.match(adapterSource, /from "\.\.\/\.\.\/\.\.\/agency\/types\.ts"/, "Pi agency adapter should consume source-root agency types");
assert.match(adapterSource, /from "\.\.\/\.\.\/\.\.\/agency\/tool\.ts"/, "Pi agency adapter should consume source-root agency tool executor");
assert.doesNotMatch(adapterSource, /application\/tools\/agency|domain\/agency\/types/, "Pi agency adapter should not call old agency shim paths");

const schemaSource = readFileSync(source("adapters", "pi", "schemas.ts"), "utf8");
assert.match(schemaSource, /from "\.\.\/\.\.\/agency\/types\.ts"/, "Pi schemas should consume source-root agency values");
assert.doesNotMatch(schemaSource, /domain\/agency\/types/, "Pi schemas should not import old agency type path");

const agencyRoot = readFileSync(source("agency", "planning.ts"), "utf8") + readFileSync(source("agency", "tool.ts"), "utf8");
assert.doesNotMatch(agencyRoot, /\.\.\/application\/agency|\.\.\/application\/tools\/agency|\.\.\/domain\/agency\/types/, "Agency root should not import old agency shim paths");
