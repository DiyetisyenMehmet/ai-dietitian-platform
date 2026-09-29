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

  const linkClose = source.indexOf('</Link>');
  const firstText = source.indexOf('<HtmlText');
  assert.ok(linkClose >= 0 && firstText > linkClose);
  assert.doesNotMatch(source, /<svg|<text|SvgText/);
});


test('blood-test dark card uses the same normalized perimeter overlay', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '../src/presentation/components/dashboard/blood-test-card.tsx'),
    'utf8',
  );

  assert.match(source, /DashboardCardNightBorder/);
});
