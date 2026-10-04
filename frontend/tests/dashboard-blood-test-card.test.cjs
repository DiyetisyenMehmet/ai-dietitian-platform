const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

test('blood-test uses shared 21:5 frame with non-interactive decorative text outside anchor', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '../src/presentation/components/dashboard/blood-test-card.tsx'),
    'utf8',
  );

  assert.match(source, /DASHBOARD_FEATURE_CARD_FRAME_ASPECT/);
  assert.match(source, /data-frame-aspect="21:5"/);
  assert.match(source, /data-blood-test-stage/);
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
  const firstText = source.indexOf('<HtmlText');
  assert.ok(linkClose >= 0 && firstText > linkClose);
  assert.doesNotMatch(source, /<svg|<text|SvgText/);
});


test('blood-test dark card uses the same normalized perimeter overlay', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '../src/presentation/components/dashboard/blood-test-card.tsx'),
    'utf8',
  );

  assert.match(source, /DashboardCardNightBorder/);
});


test('blood-test uses the same outer-frame chevron and dark perimeter as other cards', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '../src/presentation/components/dashboard/blood-test-card.tsx'),
    'utf8',
  );

  assert.match(source, /DashboardFeatureChevron/);
  assert.match(source, /DashboardCardNightBorder/);
  assert.match(source, /\[container-type:inline-size\]/);

  const stageClose = source.indexOf('</div>\n\n      <DashboardFeatureChevron');
  assert.ok(stageClose >= 0, 'shared chevron should be outside the cropped blood stage');
});


test('blood-test description is larger and moved lower while keeping its x alignment', () => {
  const file = path.join(
    __dirname,
    '../src/presentation/components/dashboard/blood-test-card-contract.ts',
  );
  const source = fs.readFileSync(file, 'utf8');

  assert.match(source, /x: 258/);
  assert.match(source, /firstY: 214/);
  assert.match(source, /secondY: 250/);
  assert.match(source, /title: \{ x: 258, y: 158, fontSize: 52/);
  assert.match(source, /fontSize: 36/);
  assert.match(source, /labelFontSize: 26/);
  assert.match(source, /valueFontSize: 25/);
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
    assert.equal(typeof copy.panelTitle, 'string');
    assert.equal(copy.labels.length, 5);
  }
});
