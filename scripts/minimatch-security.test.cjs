const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createRequire } = require('node:module');
const { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { resolve, join } = require('node:path');
const { spawnSync } = require('node:child_process');

const root = resolve(__dirname, '..');
for (const side of ['backend', 'frontend']) {
  const requireFrom = createRequire(join(root, side, 'package.json'));
  test(`${side}: every minimatch consumer uses the patched engine, with both import APIs`, () => {
    const match = requireFrom('minimatch');
    assert.equal(typeof match, 'function');
    assert.equal(match.minimatch, match);
    assert.equal(requireFrom('minimatch-engine/package.json').version, '11.0.1');
    assert.equal(match, requireFrom('minimatch-engine').minimatch);
    for (const [path, pattern, options, expected] of [
      ['src/a.ts', '**/*.ts', {}, true],
      ['src/a.js', '**/*.ts', {}, false],
      ['src/.hidden.ts', '**/*.ts', {}, false],
      ['src/.hidden.ts', '**/*.ts', { dot: true }, true],
      ['src/a.ts', '*.ts', { matchBase: true }, true],
      ['src/a.ts', '!**/*.js', {}, true],
      ['src/a.ts', '**/*.{ts,tsx}', {}, true],
      ['src/a.ts', '**/*.@(ts|tsx)', {}, true],
      ['src/a.ts', '#comment', {}, false],
    ]) {
      assert.equal(match(path, pattern, options), expected, `${path} / ${pattern}`);
      assert.equal(new match.Minimatch(pattern, options).match(path), expected);
    }
    assert.equal(match.defaults({ dot: true })('.env', '*'), true);
    assert.deepEqual(match.match(['a.ts', 'a.js'], '*.ts'), ['a.ts']);

    const lock = JSON.parse(readFileSync(join(root, side, 'package-lock.json')));
    const engines = Object.entries(lock.packages).filter(([, pkg]) => pkg.name === 'minimatch');
    assert.equal(engines.length, 1);
    assert.equal(engines[0][1].version, '11.0.1');
    assert.match(engines[0][1].resolved, /\/minimatch-11\.0\.1\.tgz$/);
    assert.match(engines[0][1].integrity, /^sha512-/);
    for (const [path, pkg] of Object.entries(lock.packages)) {
      if (path.endsWith('/minimatch')) assert.equal(pkg.link, true, path);
    }
  });

  test(`${side}: amplification input completes in a separate bounded process`, () => {
    const code = `const { Minimatch } = require('minimatch-engine');
      const p = new Minimatch('**/../'.repeat(256) + 'leaf', { optimizationLevel: 2 });
      if (p.match('other')) process.exit(1);`;
    const result = spawnSync(process.execPath, ['-e', code], {
      cwd: join(root, side), timeout: 5000, encoding: 'utf8',
    });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
  });

  test(`${side}: ESLint still selects files and reports real rule violations`, async () => {
    const { ESLint } = requireFrom('eslint');
    const lint = new ESLint({ overrideConfigFile: true, overrideConfig: [{
      files: ['**/*.js'], ignores: ['**/ignored/**'], rules: { 'no-debugger': 'error' },
    }] });
    const [bad] = await lint.lintText('debugger;', { filePath: 'src/example.js' });
    assert.equal(bad.messages[0].ruleId, 'no-debugger');
    const [good] = await lint.lintText('const value = 1;', { filePath: 'src/example.js' });
    assert.equal(good.errorCount, 0);
    assert.equal(await lint.isPathIgnored('src/example.ts'), true);
  });
}

test('backend: Swagger discovers nested TS/JS annotations using the compatible glob parent', async () => {
  const requireFrom = createRequire(join(root, 'backend/package.json'));
  const fixture = mkdtempSync(join(tmpdir(), 'g1-swagger-glob-'));
  try {
    mkdirSync(join(fixture, 'modules', 'nested'), { recursive: true });
    writeFileSync(join(fixture, 'modules', 'nested', 'proof.routes.ts'), `/**
 * @openapi
 * /synthetic-proof:
 *   get:
 *     responses:
 *       '200':
 *         description: Synthetic compatibility proof
 */`);
    writeFileSync(join(fixture, 'modules', 'nested', 'ignore.txt'), 'not a route');
    const pattern = `${fixture}/modules/**/*.routes.{ts,js}`;
    const swagger = requireFrom('swagger-jsdoc');
    const spec = swagger({ definition: { openapi: '3.0.0', info: { title: 'Synthetic', version: '1' } }, apis: [pattern] });
    assert.ok(spec.paths['/synthetic-proof'].get.responses['200']);
    const glob = createRequire(requireFrom.resolve('swagger-jsdoc'))('glob');
    assert.equal(glob.sync(pattern).length, 1);
    assert.equal((await glob.glob(pattern)).length, 1);
    assert.deepEqual(glob.sync(`${fixture}/**/*.missing`), []);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});
