const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function loadContract() {
  const file = path.join(
    __dirname,
    '../src/presentation/components/dashboard/dashboard-live-feature-card-contract.ts',
  );
  const source = fs.readFileSync(file, 'utf8');
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports });
  return exports;
}

test('food and progress use one 21:5 visible frame without artwork stretch', () => {
  const contract = loadContract();
  assert.equal(contract.DASHBOARD_FEATURE_CARD_FRAME_ASPECT, '21 / 5');
  assert.equal(contract.DASHBOARD_LIVE_FEATURE_CARD_ASPECT, '1536 / 512');

  for (const kind of ['food', 'progress']) {
    const crop = contract.DASHBOARD_LIVE_FEATURE_CARD_CROP[kind];
    assert.ok(crop.left >= 0 && crop.top >= 0);
    assert.ok(crop.width <= 1536 && crop.height <= 512);
    assert.ok(Math.abs(crop.width / crop.height - 4.2) < 0.02);
  }
});

test('food and progress visible text stays outside navigation anchor', () => {
  const source = fs.readFileSync(
    path.join(
      __dirname,
      '../src/presentation/components/dashboard/dashboard-live-feature-card.tsx',
    ),
    'utf8',
  );

  assert.match(source, /data-frame-aspect="21:5"/);
  assert.match(source, /data-dashboard-live-feature-stage/);
  assert.match(source, /data-dashboard-live-feature-link/);
  assert.match(source, /data-dashboard-live-feature-text/);
  assert.match(source, /data-selectable-text="true"/);
  assert.match(source, /userSelect: "text"/);
  assert.match(source, /WebkitUserSelect: "text"/);
  assert.match(source, /touchAction: "auto"/);
  assert.match(source, /</Link>s*
s*<HtmlText/);
  assert.doesNotMatch(source, /<Link[sS]*?<HtmlText[sS]*?</Link>/);
  assert.doesNotMatch(source, /<svg|<text|SvgText/);
});
