const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(relative) {
  return fs.readFileSync(path.join(__dirname, '..', relative), 'utf8');
}

test('fixed dashboard geometry is the only web surface with text-size-adjust lock', () => {
  const css = read('src/app/globals.css');
  assert.match(css, /\[data-dashboard-fixed-geometry\]/);
  assert.match(css, /-webkit-text-size-adjust:\s*100%/);
  assert.match(css, /text-size-adjust:\s*100%/);
  assert.match(css, /\[data-dashboard-decorative-text\]/);
  assert.doesNotMatch(css, /html\.diewish-android\s+\*/);
  assert.doesNotMatch(css, /body\s*\{[^}]*text-size-adjust/s);
});

test('coach dashboard banner participates in fixed geometry without disabling its link', () => {
  const source = read('src/presentation/components/dashboard/dashboard-ai-banner.tsx');
  assert.match(source, /data-dashboard-coach-banner/);
  assert.match(source, /data-dashboard-fixed-geometry/);
  assert.match(source, /data-dashboard-decorative-text/);
  assert.match(source, /href="\/ai"/);
});

test('Android WebView consumes native long-click without changing global text zoom', () => {
  const source = read('../android/app/src/main/java/com/diewish/app/MainActivity.java');
  assert.match(source, /setOnLongClickListener\(view -> true\)/);
  assert.match(source, /setHapticFeedbackEnabled\(false\)/);
  assert.doesNotMatch(source, /setTextZoom\s*\(/);
});

test('normal content is not globally marked as unselectable', () => {
  const css = read('src/app/globals.css');
  assert.doesNotMatch(css, /html\.diewish-android[^\{]*\{[^}]*user-select:\s*none/s);
  assert.doesNotMatch(css, /body[^\{]*\{[^}]*user-select:\s*none/s);
});
