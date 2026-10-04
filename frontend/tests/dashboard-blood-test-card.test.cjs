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

  const linkMarker = source.indexOf('data-blood-test-link');
  const firstRenderedText = source.indexOf('<HtmlText', linkMarker);
  assert.ok(linkMarker >= 0 && firstRenderedText > linkMarker);
  assert.doesNotMatch(source, /<svg|<text|SvgText/);
});


test('blood-test artwork is rendered once and no second live preview container is introduced', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '../src/presentation/components/dashboard/blood-test-card.tsx'),
    'utf8',
  );
  const contractSource = fs.readFileSync(
    path.join(__dirname, '../src/presentation/components/dashboard/blood-test-card-contract.ts'),
    'utf8',
  );

  assert.match(source, /data-blood-test-base-visual/);
  assert.match(contractSource, /blood-test-card-clean-light-21x5\.webp/);
  assert.doesNotMatch(source, /dashboard-blood-preview/);
  assert.doesNotMatch(source, /DashboardFeatureChevron/);
  assert.doesNotMatch(source, /DashboardCardNightBorder/);
  assert.match(source, /\[container-type:inline-size\]/);
});


test('blood-test light layout aligns live copy to the approved clean 21:5 artwork', () => {
  const file = path.join(
    __dirname,
    '../src/presentation/components/dashboard/blood-test-card-contract.ts',
  );
  const source = fs.readFileSync(file, 'utf8');

  assert.match(source, /light: \{/);
  assert.match(source, /title: \{ x: 276, y: 116, fontSize: 50/);
  assert.match(source, /firstY: 165/);
  assert.match(source, /secondY: 202/);
  assert.match(source, /fontSize: 42/);
  assert.match(source, /example: \{ x: 276, y: 244, fontSize: 27/);
  assert.match(source, /panelTitle: \{ x: 846, y: 76, fontSize: 26/);
  assert.match(source, /status: \{ x: 1193, y: 75, fontSize: 22/);
  assert.match(source, /labelX: 846/);
  assert.match(source, /valueX: 1265/);
  assert.match(source, /y: \[121, 162, 204, 246, 288\]/);
  assert.match(source, /labelFontSize: 20/);
  assert.match(source, /valueFontSize: 19/);
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
