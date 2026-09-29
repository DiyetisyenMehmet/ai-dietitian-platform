const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('blood-test visible text is outside the navigation anchor', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '../src/presentation/components/dashboard/blood-test-card.tsx'),
    'utf8',
  );

  assert.match(source, /data-blood-test-link/);
  assert.match(source, /data-blood-test-live-text/);
  assert.match(source, /data-selectable-text="true"/);
  assert.match(source, /userSelect: "text"/);
  assert.match(source, /WebkitUserSelect: "text"/);
  assert.match(source, /touchAction: "auto"/);
  assert.match(source, /<\/Link>\s*\n\s*<HtmlText/);
  assert.doesNotMatch(source, /<Link[\s\S]*?<HtmlText[\s\S]*?<\/Link>/);
  assert.doesNotMatch(source, /<svg|<text|SvgText/);
});
