# Future External Users

Future external users may include people and agents working through CLI, TUI, MCP, editor panels, service agents, package APIs, or optional runtime programs.

From a product point of view, these users should get the same durable semantics as current host-adapter users:

- read trace-backed status;
- inspect current hot knowledge and work views;
- request semantic loop iterations;
- use loop-governed automation where supported;
- record evidence and exit-condition outcomes through typed capabilities;
- avoid editing generated files directly.

Technical distribution details belong under system API, adapter, and extension docs. Visual interfaces belong under product UI docs only when users can see and interact with them.

## Success signals

- External users get the same truth boundaries as current users.
- Access path differences do not change CodeWiki semantics.
- Visual and non-visual access surfaces are documented in the correct layer.

## Related docs

- [CodeWiki API](../../system/api.md)
- [API vNext Tool Surface](../../system/api-vnext-tools.md)
- [Extension](../../system/extension.md)
