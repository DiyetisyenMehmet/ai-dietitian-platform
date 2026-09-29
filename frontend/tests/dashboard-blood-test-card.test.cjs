const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('blood-test uses shared 21:5 frame and preserves selectable text outside anchor', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '../src/presentation/components/dashboard/blood-test-card.tsx'),
    'utf8',
  );

  assert.match(source, /DASHBOARD_FEATURE_CARD_FRAME_ASPECT/);
  assert.match(source, /data-frame-aspect="21:5"/);
  assert.match(source, /data-blood-test-stage/);
  assert.match(source, /data-blood-test-link/);
  assert.match(source, /data-blood-test-live-text/);
  assert.match(source, /data-selectable-text="true"/);
  assert.match(source, /userSelect: "text"/);
  assert.match(source, /WebkitUserSelect: "text"/);
  assert.match(source, /touchAction: "auto"/);
  assert.match(source, /</Link>s*
s*<HtmlText/);
  assert.doesNotMatch(source, /<Link[sS]*?<HtmlText[sS]*?</Link>/);
  assert.doesNotMatch(source, /<svg|<text|SvgText/);
});
