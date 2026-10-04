const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

test('blood-test uses one compact base visual with non-interactive decorative text outside anchor', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '../src/presentation/components/dashboard/blood-test-card.tsx'),
    'utf8',
  );

  assert.match(source, /data-frame-height="84px"/);
  assert.match(source, /data-blood-test-link/);
  assert.match(source, /data-blood-test-live-text/);
  assert.match(source, /data-dashboard-fixed-geometry/);
  assert.match(source, /data-dashboard-decorative-text/);
  assert.match(source, /data-selectable-text="false"/);
  assert.match(source, /userSelect: "none"/);
  assert.match(source, /WebkitUserSelect: "none"/);
  assert.match(source, /pointerEvents: "none"/);
  assert.match(source, /touchAction: "manipulation"/);

  const linkClose = source.indexOf('</Link>');
  const firstRenderedText = source.indexOf('<HtmlText', linkClose);
  assert.ok(linkClose >= 0 && firstRenderedText > linkClose);
  assert.doesNotMatch(source, /<svg|<text|SvgText/);
});


test('blood-test artwork is rendered once and no second live preview container is introduced', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '../src/presentation/components/dashboard/blood-test-card.tsx'),
    'utf8',
  );

  assert.match(source, /data-blood-test-base-visual/);
  assert.doesNotMatch(source, /dashboard-blood-preview/);
  assert.doesNotMatch(source, /DashboardFeatureChevron/);
  assert.doesNotMatch(source, /DashboardCardNightBorder/);
  assert.match(source, /\[container-type:inline-size\]/);
});


test('blood-test description is larger and moved lower while keeping its x alignment', () => {
  const file = path.join(
    __dirname,
    '../src/presentation/components/dashboard/blood-test-card-contract.ts',
  );
  const source = fs.readFileSync(file, 'utf8');

  assert.match(source, /x: 258/);
  assert.match(source, /firstY: 204/);
  assert.match(source, /secondY: 239/);
  assert.match(source, /title: \{ x: 258, y: 150, fontSize: 50/);
  assert.match(source, /example: \{ x: 258, y: 278, fontSize: 27/);
  assert.match(source, /fontSize: 34/);
  assert.match(source, /labelFontSize: 22/);
  assert.match(source, /valueFontSize: 21/);
});


function loadBloodContract() {
  const file = path.join(
    __dirname,
    '../src/presentation/components/dashboard/blood-test-card-contract.ts',
  );
  const source = fs.readFileSync(file, 'utf8');
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports });
  return exports;
}

test('blood-test copy contract remains complete in Turkish and English', () => {
  const contract = loadBloodContract();

  for (const locale of ['tr', 'en']) {
    const copy = contract.BLOOD_TEST_CARD_COPY[locale];
    assert.equal(typeof copy.title, 'string');
    assert.ok(copy.title.length > 0);
    assert.equal(copy.description.length, 2);
    assert.ok(copy.description.every((line) => typeof line === 'string' && line.length > 0));
    assert.equal(typeof copy.example, 'string');
    assert.ok(copy.example.length > 0);
    assert.equal(typeof copy.panelTitle, 'string');
    assert.equal(copy.labels.length, 5);
  }
});
