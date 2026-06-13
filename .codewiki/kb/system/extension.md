# Pi Extension

The active CodeWiki Pi extension is disabled during the rebuild. `package.json` must not expose `pi.extensions` or `pi.skills` until a future explicit decision reintroduces the extension.

Target Pi integration will live under `src/pi/**` and should expose terminal-first commands, tools, prompt assets, and TUI views only after the reduced core tool facade is stable. Pi is a primary host adapter, not the CodeWiki core; core source must not import the Pi SDK directly.

The target CodeWiki OS still needs `wiki_*` tools. They should return as thin Pi adapter registrations over the harness-agnostic core APIs, not as a restoration of the old extension internals. CLI and MCP adapters should be able to expose the same semantics.

## Rebuild rules

- Do not use archived `wiki_*` tools in this repository while the extension is disabled.
- Do not run CodeWiki-owned compaction, resume injection, or auto-pickup.
- Use Pi native compaction only.
- Treat `_OLD_VERSION/**` as migration reference.
- Treat `.codewiki/kb/**` as hot design truth and `.codewiki/traces/TRACE-*.jsonl` as future workflow/state truth.

## Related docs

- [File Structure](file-structure.md)
- [Traces](traces.md)
- [Runtime](runtime.md)
- [API vNext Tool Surface](api-vnext-tools.md)
- [Migration Audit](migration-audit.md)
