const test = require("node:test");
const assert = require("node:assert/strict");
const { renderFixture } = require("./helpers/dashboard-layout-fixture.cjs");
const {
  BLOOD_TEST_CARD_COPY,
  BLOOD_TEST_CARD_VALUES,
} = require("../src/presentation/components/dashboard/blood-test-card-contract.ts");

test("blood preview has matching, complete bilingual labels and values", () => {
  for (const locale of ["tr", "en"]) {
    const copy = BLOOD_TEST_CARD_COPY[locale];
    assert.ok(copy.title && copy.description.every(Boolean) && copy.example);
    assert.equal(copy.labels.length, BLOOD_TEST_CARD_VALUES.length);
    assert.equal(new Set(copy.labels).size, 5);
    assert.ok(copy.labels.every(Boolean) && BLOOD_TEST_CARD_VALUES.every(Boolean));
  }
});

test("sample blood values are visibly labelled and excluded from navigation accessible names", async () => {
  for (const locale of ["tr", "en"]) {
    const html = await renderFixture(locale);
    const names = [...html.matchAll(/aria-label="([^"]+)"[^>]*data-blood-test-link/g)].map(
      (match) => match[1],
    );
    assert.equal(names.length, 2); // CSS shows exactly one theme, tested in Chromium.
    assert.ok(
      names.every(
        (name) => name.includes(BLOOD_TEST_CARD_COPY[locale].title) && !name.includes("168"),
      ),
    );
    assert.match(html, new RegExp(BLOOD_TEST_CARD_COPY[locale].example));
    assert.equal((html.match(/data-blood-test-row="/g) || []).length, 10);
  }
});
