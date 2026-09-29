const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(relative) {
  return fs.readFileSync(path.join(__dirname, '..', relative), 'utf8');
}

test('default home screen uses the enlarged typography scale', () => {
  const metrics = read('src/presentation/components/dashboard/dashboard-metrics-section.tsx');
  const quick = read('src/presentation/components/dashboard/dashboard-quick-actions.tsx');
  const banner = read('src/presentation/components/dashboard/dashboard-ai-banner.tsx');
  const view = read('src/presentation/components/dashboard/dashboard-view.tsx');
  const header = read('src/presentation/components/dashboard/dashboard-home-header.tsx');

  assert.match(metrics, /text-\[16px\]/);
  assert.match(metrics, /text-\[13px\]/);
  assert.match(quick, /text-\[22px\]/);
  assert.match(quick, /text-\[12px\]/);
  assert.match(banner, /3\.2vw/);
  assert.match(banner, /2\.55vw/);
  assert.match(view, /text-lg font-semibold text-muted-foreground/);
  assert.match(header, /text-\[28px\]/);
});
