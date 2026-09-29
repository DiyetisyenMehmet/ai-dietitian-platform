const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function loadContract() {
  const file = path.join(__dirname, '../src/presentation/components/dashboard/blood-test-card-contract.ts');
  const source = fs.readFileSync(file, 'utf8');
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports });
  return exports;
}

test('blood-test card keeps the approved fixed coordinate system', () => {
  const contract = loadContract();
  assert.deepEqual({ ...contract.BLOOD_TEST_CARD_VIEWBOX }, { width: 1438, height: 413 });
  assert.equal(contract.BLOOD_TEST_CARD_ASPECT, '1438 / 413');
  assert.deepEqual([...contract.BLOOD_TEST_CARD_LAYOUT.rows.y], [140, 185, 230, 276, 322]);
  assert.equal(contract.BLOOD_TEST_CARD_LAYOUT.rows.valueX, 1174);
});

test('blood-test live copy is TR and EN only', () => {
  const { BLOOD_TEST_CARD_COPY, BLOOD_TEST_CARD_VALUES } = loadContract();
  assert.deepEqual(Object.keys(BLOOD_TEST_CARD_COPY).sort(), ['en', 'tr']);
  assert.equal(BLOOD_TEST_CARD_COPY.tr.title, 'Kan Tahlili Analizi');
  assert.equal(BLOOD_TEST_CARD_COPY.en.title, 'Blood Test Analysis');
  assert.deepEqual([...BLOOD_TEST_CARD_VALUES], [
    '168 mg/dL',
    '102 mg/dL',
    '92 mg/dL',
    '23 ng/mL',
    '320 pg/mL',
  ]);
});

test('blood-test user-facing strings are selectable HTML, not SVG', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '../src/presentation/components/dashboard/blood-test-card.tsx'),
    'utf8',
  );

  assert.equal((source.match(/<Image/g) || []).length, 1);
  assert.match(source, /data-text-layer="html"/);
  assert.match(source, /data-selectable-text="true"/);
  assert.match(source, /userSelect: "text"/);
  assert.match(source, /WebkitUserSelect: "text"/);
  assert.match(source, /<span/);
  assert.doesNotMatch(source, /<svg|<text|SvgText/);
});
