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
  assert.equal(contract.DASHBOARD_LIVE_FEATURE_CARD_CROP.progress.dark.left, 49);
  assert.equal(contract.DASHBOARD_LIVE_FEATURE_CARD_CROP.progress.dark.top, 88);
  assert.equal(contract.DASHBOARD_LIVE_FEATURE_CARD_CROP.progress.dark.width, 1432);
  assert.equal(contract.DASHBOARD_LIVE_FEATURE_CARD_CROP.progress.dark.height, 341);
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


test('dark feature cards use one uniform perimeter overlay', () => {
  const source = fs.readFileSync(
    path.join(
      __dirname,
      '../src/presentation/components/dashboard/dashboard-live-feature-card.tsx',
    ),
    'utf8',
  );
  const border = fs.readFileSync(
    path.join(
      __dirname,
      '../src/presentation/components/dashboard/dashboard-card-night-border.tsx',
    ),
    'utf8',
  );

  assert.match(source, /DashboardCardNightBorder/);
  assert.match(border, /data-dashboard-card-night-border/);
  assert.match(border, /inset_0_0_0_2px/);
  assert.match(border, /dark:block/);
});


test('progress light icon is normalized to the Food icon footprint', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '../src/presentation/components/dashboard/dashboard-live-feature-card.tsx'),
    'utf8',
  );

  assert.match(source, /data-progress-light-icon-normalizer/);
  assert.match(source, /left-\[2\.8%\]/);
  assert.match(source, /w-\[12\.7%\]/);
  assert.match(source, /h-\[53\.4%\]/);
});

test('all live feature cards use the shared opaque chevron and dark-edge mask', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '../src/presentation/components/dashboard/dashboard-live-feature-card.tsx'),
    'utf8',
  );
  const chevron = fs.readFileSync(
    path.join(__dirname, '../src/presentation/components/dashboard/dashboard-feature-chevron.tsx'),
    'utf8',
  );
  const border = fs.readFileSync(
    path.join(__dirname, '../src/presentation/components/dashboard/dashboard-card-night-border.tsx'),
    'utf8',
  );

  assert.match(source, /DashboardFeatureChevron/);
  assert.match(chevron, /data-dashboard-feature-chevron/);
  assert.match(chevron, /bg-white/);
  assert.match(chevron, /dark:bg-\[#06283c\]/);
  assert.match(border, /inset_0_0_0_4px/);
  assert.match(border, /border-\[#23585d\]/);
});


test('dark artwork edge masks target only the remaining bright edges', () => {
  const source = fs.readFileSync(
    path.join(
      __dirname,
      '../src/presentation/components/dashboard/dashboard-live-feature-card.tsx',
    ),
    'utf8',
  );
  const border = fs.readFileSync(
    path.join(
      __dirname,
      '../src/presentation/components/dashboard/dashboard-card-night-border.tsx',
    ),
    'utf8',
  );

  assert.match(source, /data-dashboard-dark-edge-mask="food"/);
  assert.match(source, /data-dashboard-dark-edge-mask="progress"/);
  assert.match(source, /bottom-0 h-\[5%\]/);
  assert.match(source, /left-0 w-\[1\.35%\]/);
  assert.match(border, /border-\[#173f44\]/);
  assert.match(border, /inset_0_0_0_3px/);
});


test('feature-card descriptions are larger and sit lower without changing horizontal alignment', () => {
  const contract = loadContract();

  assert.equal(contract.DASHBOARD_LIVE_FEATURE_CARD_LAYOUT.food.x, 310);
  assert.equal(contract.DASHBOARD_LIVE_FEATURE_CARD_LAYOUT.food.descriptionFontSize, 32);
  assert.equal(contract.DASHBOARD_LIVE_FEATURE_CARD_LAYOUT.food.descriptionFirstY, 267);
  assert.equal(contract.DASHBOARD_LIVE_FEATURE_CARD_LAYOUT.food.descriptionSecondY, 313);

  assert.equal(contract.DASHBOARD_LIVE_FEATURE_CARD_LAYOUT.progress.x, 305);
  assert.equal(contract.DASHBOARD_LIVE_FEATURE_CARD_LAYOUT.progress.descriptionFontSize, 33);
  assert.equal(contract.DASHBOARD_LIVE_FEATURE_CARD_LAYOUT.progress.descriptionFirstY, 259);
  assert.equal(contract.DASHBOARD_LIVE_FEATURE_CARD_LAYOUT.progress.descriptionSecondY, 303);
});
