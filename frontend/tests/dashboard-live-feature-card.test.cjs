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

test('food and progress keep one visible 21:5 frame with theme-specific artwork alignment', () => {
  const contract = loadContract();
  assert.equal(contract.DASHBOARD_FEATURE_CARD_FRAME_ASPECT, '21 / 5');

  for (const kind of ['food', 'progress']) {
    for (const theme of ['light', 'dark']) {
      const crop = contract.DASHBOARD_LIVE_FEATURE_CARD_CROP[kind][theme];
      assert.ok(crop.left >= 0 && crop.top >= 0);
      assert.ok(crop.width <= 1536 && crop.height <= 512);
      assert.ok(Math.abs(crop.width / crop.height - 4.2) < 0.02);
    }
  }

  assert.equal(contract.DASHBOARD_LIVE_FEATURE_CARD_CROP.progress.light.left, 75);
  assert.equal(contract.DASHBOARD_LIVE_FEATURE_CARD_CROP.progress.dark.left, 55);
});

test('food and progress share one fixed chevron overlay across themes', () => {
  const source = fs.readFileSync(
    path.join(
      __dirname,
      '../src/presentation/components/dashboard/dashboard-live-feature-card.tsx',
    ),
    'utf8',
  );

  assert.match(source, /data-dashboard-live-feature-chevron/);
  assert.match(source, /right-\[1%\]/);
  assert.match(source, /top-1\/2/);
  assert.match(source, /size-\[8cqw\]/);
  assert.match(source, /ThemeArtwork kind=\{kind\} theme="light"/);
  assert.match(source, /ThemeArtwork kind=\{kind\} theme="dark"/);
});

test('selectable HTML text remains locked to the visible frame above artwork', () => {
  const source = fs.readFileSync(
    path.join(
      __dirname,
      '../src/presentation/components/dashboard/dashboard-live-feature-card.tsx',
    ),
    'utf8',
  );

  assert.match(source, /data-text-space="visible-frame"/);
  assert.match(source, /data-text-layer="html-visible-frame"/);
  assert.match(source, /userSelect: "text"/);
  assert.match(source, /WebkitUserSelect: "text"/);
  assert.match(source, /touchAction: "auto"/);
  assert.doesNotMatch(source, /<svg|<text|SvgText/);
});
