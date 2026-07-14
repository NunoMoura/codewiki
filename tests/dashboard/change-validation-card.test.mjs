import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { renderDashboardChangeValidationCard } from "../../src/dashboard/change-validation-card.ts";
import { buildChangeValidationCard } from "../../src/changes/validation-view.ts";
import { createChangeRecord } from "../../src/changes/records.ts";
import { acceptedChangeFixture } from "../helpers/accepted-change.mjs";

describe("dashboard Change validation card", () => {
	it("renders shared semantic sections with escaped bounded HTML", () => {
		const record = createChangeRecord(
			acceptedChangeFixture({
				id: "CHG-dashboard-card",
				currentState: "<script>alert('current')</script>",
				desiredState: "Render <strong>safe</strong> text.",
			}),
		);
		const html = renderDashboardChangeValidationCard(
			buildChangeValidationCard(record),
		);

		assert.match(html, /Current state/);
		assert.match(html, /Proposed change/);
		assert.match(html, /Agent opinion/);
		assert.match(html, /CHG-dashboard-card/);
		assert.match(
			html,
			/&lt;script&gt;alert\(&#39;current&#39;\)&lt;\/script&gt;/,
		);
		assert.match(html, /Render &lt;strong&gt;safe&lt;\/strong&gt; text\./);
		assert.equal(html.includes("<script>"), false);
		assert.equal(html.includes("<strong>safe</strong>"), false);
	});
});
