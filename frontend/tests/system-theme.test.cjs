const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
function model({ pathname = '/login', theme = 'system', resolvedTheme = 'dark', classDark = true, scheme = 'dark', modern = true, throwing = false } = {}) {
  let effect, observer;
  const calls = [], selected = [];
  const root = { dataset: {}, style: { colorScheme: scheme }, classList: { contains: () => classDark } };
  const react = { useEffect(fn) { effect = fn; }, useState(initial) { return [initial, () => {}]; }, createElement(type, props, ...children) { return { type, props: { ...props, children } }; } };
  const bridge = { setDarkTheme: dark => calls.push(['legacy', dark]) };
  if (modern) bridge.setThemePreference = (choice, dark) => { if (throwing) throw Error('synthetic unavailable host'); calls.push([choice, dark]); };
  const context = { exports: {}, window: { DiewishSystemUi: bridge }, document: { documentElement: root }, MutationObserver: class {
    constructor(callback) { observer = this; this.callback = callback; this.disconnected = false; }
    observe() {} disconnect() { this.disconnected = true; }
  }, require(name) {
    if (name === 'react') return react;
    if (name === 'next-themes') return { ThemeProvider: 'next-provider', useTheme: () => ({ theme, resolvedTheme, setTheme: value => selected.push(value) }) };
    if (name === 'next/navigation') return { usePathname: () => pathname };
    if (name === 'lucide-react') return Object.fromEntries(['Check','Monitor','Moon','Sun'].map(name => [name, name]));
    return name.endsWith('/button') ? { Button: 'button' } : {};
  } };
  function load(file) {
    context.exports = {};
    vm.runInNewContext('(function(){' + ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/presentation', file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2020 } }).outputText + '\n})();', context);
    return context.exports;
  }
  return { calls, selected, root, sync() {
    const tree = load('providers/theme-provider.tsx').ThemeProvider({ children: 'app' });
    tree.props.children[0].type(); const cleanup = effect();
    return { cleanup, get observer() { return observer; } };
  }, toggle: () => load('components/layout/theme-toggle.tsx').ThemeToggle() };
}
test('system choice reaches native only after context, class and color-scheme agree', () => {
  const m = model({ scheme: '' }), lifecycle = m.sync();
  assert.equal(m.calls.length, 0);
  m.root.style.colorScheme = 'dark'; lifecycle.observer.callback();
  assert.deepEqual(m.calls, [['system', true]]);
  lifecycle.observer.callback(); assert.equal(m.calls.length, 1);
  lifecycle.cleanup(); assert.equal(lifecycle.observer.disconnected, true);
  assert.equal(m.root.dataset.diewishThemeReady, undefined);
});
test('a stale context cannot publish an opposite native frame', () => {
  const m = model({ classDark: false }); m.sync(); assert.equal(m.calls.length, 0);
});
test('saved manual light remains a manual preference on a dark-capable device', () => {
  const m = model({ theme: 'light', resolvedTheme: 'light', classDark: false, scheme: 'light' }); m.sync();
  assert.deepEqual(m.calls, [['light', false]]);
});
test('old Android shells receive the existing presentation callback', () => {
  const m = model({ modern: false }); m.sync(); assert.deepEqual(m.calls, [['legacy', true]]);
});
test('Admin does not publish normal-app preference and retains the legacy button action', () => {
  const m = model({ pathname: '/admin', theme: 'dark' }); m.sync(); assert.equal(m.calls.length, 0);
  const button = m.toggle(); assert.equal(button.props['aria-label'], 'Açık temaya geç');
  button.props.onClick(); assert.deepEqual(m.selected, ['light']);
});
test('unavailable presentation bridge cannot throw into the application', () => {
  const m = model({ throwing: true }); assert.doesNotThrow(() => m.sync());
});
