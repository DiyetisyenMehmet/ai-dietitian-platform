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

test('food and progress cards share one immutable theme geometry', () => {
  const contract = loadContract();
  assert.deepEqual(
    { ...contract.DASHBOARD_LIVE_FEATURE_CARD_VIEWBOX },
    { width: 1536, height: 512 },
  );
  assert.equal(contract.DASHBOARD_LIVE_FEATURE_CARD_ASPECT, '1536 / 512');

  for (const kind of ['food', 'progress']) {
    const base = contract.DASHBOARD_LIVE_FEATURE_CARD_BASE[kind];
    assert.equal(base.light.endsWith('-card-base-light.png'), true);
    assert.equal(base.dark.endsWith('-card-base-dark.png'), true);

    const layout = contract.DASHBOARD_LIVE_FEATURE_CARD_LAYOUT[kind];
    assert.equal(typeof layout.x, 'number');
    assert.equal(layout.safeTextRight <= 850, true);
  }
});

test('food and progress expose complete TR and EN live copy', () => {
  const { DASHBOARD_LIVE_FEATURE_CARD_COPY } = loadContract();
  assert.equal(DASHBOARD_LIVE_FEATURE_CARD_COPY.food.tr.title, 'Besin ve Barkod Tarayıcı');
  assert.equal(DASHBOARD_LIVE_FEATURE_CARD_COPY.food.en.title, 'Food & Barcode Scanner');
  assert.equal(DASHBOARD_LIVE_FEATURE_CARD_COPY.progress.tr.title, 'İlerlememi Gör');
  assert.equal(DASHBOARD_LIVE_FEATURE_CARD_COPY.progress.en.title, 'View My Progress');
});

test('food and progress render selectable HTML text, never SVG text', () => {
  const source = fs.readFileSync(
    path.join(
      __dirname,
      '../src/presentation/components/dashboard/dashboard-live-feature-card.tsx',
    ),
    'utf8',
  );

  assert.equal((source.match(/<Image/g) || []).length, 2);
  assert.match(source, /data-text-layer="html"/);
  assert.match(source, /data-selectable-text="true"/);
  assert.match(source, /userSelect: "text"/);
  assert.match(source, /WebkitUserSelect: "text"/);
  assert.match(source, /<span/);
  assert.doesNotMatch(source, /<svg|<text|SvgText/);
  assert.doesNotMatch(source, /pointer-events-none absolute inset-0 size-full/);
});

test('dashboard uses one permanent feature stack instead of separate theme stacks', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '../src/presentation/components/dashboard/dashboard-feature-links.tsx'),
    'utf8',
  );

  assert.equal((source.match(/space-y-\[clamp/g) || []).length, 1);
  assert.match(source, /BloodTestThemeSlot/);
});
