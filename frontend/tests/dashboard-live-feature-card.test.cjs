const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { renderFixture } = require("./helpers/dashboard-layout-fixture.cjs");
const contract = require("../src/presentation/components/dashboard/dashboard-live-feature-card-contract.ts");

test("food and progress retain both translations and existing theme assets", () => {
  for (const kind of ["food", "progress"]) {
    for (const locale of ["tr", "en"]) {
      const copy = contract.DASHBOARD_LIVE_FEATURE_CARD_COPY[kind][locale];
      assert.ok(copy.title && copy.description.length === 2 && copy.description.every(Boolean));
    }
    for (const theme of ["light", "dark"]) {
      assert.ok(
        fs.existsSync(
          path.join(__dirname, "../public", contract.DASHBOARD_LIVE_FEATURE_CARD_BASE[kind][theme]),
        ),
      );
      for (const region of Object.values(
        contract.DASHBOARD_LIVE_FEATURE_CARD_REGIONS[kind][theme],
      )) {
        assert.ok(region.x >= 0 && region.y >= 0 && region.width > 0 && region.height > 0);
        assert.ok(region.x + region.width <= contract.DASHBOARD_LIVE_FEATURE_CARD_VIEWBOX.width);
        assert.ok(region.y + region.height <= contract.DASHBOARD_LIVE_FEATURE_CARD_VIEWBOX.height);
      }
    }
  }
});

test("each feature keeps one accessible navigation target, with full untranslated copy", async () => {
  for (const locale of ["tr", "en"]) {
    const html = await renderFixture(locale);
    assert.equal((html.match(/data-dashboard-live-feature-link=/g) || []).length, 2);
    assert.match(html, /href="\/meals\/scan"/);
    assert.match(html, /href="\/progress"/);
    assert.match(
      html,
      new RegExp(contract.DASHBOARD_LIVE_FEATURE_CARD_COPY.progress[locale].title),
    );
  }
});
