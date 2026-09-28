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

test('blood-test card uses one fixed coordinate system for every locale and theme', () => {
  const contract = loadContract();
  assert.deepEqual({ ...contract.BLOOD_TEST_CARD_VIEWBOX }, { width: 1438, height: 413 });
  assert.equal(contract.BLOOD_TEST_CARD_ASPECT, '1438 / 413');
  assert.deepEqual([...contract.BLOOD_TEST_CARD_LAYOUT.rows.y], [140, 185, 230, 276, 322]);
  assert.equal(contract.BLOOD_TEST_CARD_LAYOUT.rows.valueX, 1174);
  assert.equal(contract.BLOOD_TEST_CARD_BASE.light.endsWith('blood-test-card-base-light.png'), true);
  assert.equal(contract.BLOOD_TEST_CARD_BASE.dark.endsWith('blood-test-card-base-dark.png'), true);
});

test('TR, EN and AR copy contains the complete live-text contract', () => {
  const { BLOOD_TEST_CARD_COPY, BLOOD_TEST_CARD_VALUES } = loadContract();
  assert.equal(BLOOD_TEST_CARD_COPY.tr.title, 'Kan Tahlili Analizi');
  assert.equal(BLOOD_TEST_CARD_COPY.en.title, 'Blood Test Analysis');
  assert.equal(BLOOD_TEST_CARD_COPY.ar.title, 'تحليل فحوصات الدم');
  for (const locale of ['tr', 'en', 'ar']) {
    assert.equal(BLOOD_TEST_CARD_COPY[locale].description.length, 2);
    assert.equal(BLOOD_TEST_CARD_COPY[locale].labels.length, 5);
  }
  assert.deepEqual([...BLOOD_TEST_CARD_VALUES], [
    '168 mg/dL',
    '102 mg/dL',
    '92 mg/dL',
    '23 ng/mL',
    '320 pg/mL',
  ]);
});

test('component source keeps artwork single-layered and text live', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '../src/presentation/components/dashboard/blood-test-card.tsx'),
    'utf8',
  );
  assert.equal((source.match(/<Image/g) || []).length, 1);
  assert.match(source, /<svg/);
  assert.match(source, /<SvgText/);
  assert.match(source, /unoptimized/);
  assert.doesNotMatch(
    source,
    /ReferenceChevronOverlay|backgroundImage|maskImage|foreignObject|blood-chevron-clean/,
  );
});
