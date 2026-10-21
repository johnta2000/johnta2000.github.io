import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

test('preview contains only JSX assets, removes telemetry, and can be rebuilt safely', () => {
  const output = mkdtempSync(path.join(tmpdir(), 'jsx-preview-test-'));
  try {
    const build = () => execFileSync(process.execPath, ['scripts/preview/build-jsx.mjs', output]);
    build();
    const html = readFileSync(path.join(output, 'tools/jsx/index.html'), 'utf8');
    assert.doesNotMatch(html, /analytics\.js|posthog\.com/);
    assert.match(html, /noindex, nofollow/);
    assert.match(html, /preview\.js/);
    assert.match(html, /Reset walkthrough/);
    assert.deepEqual(readdirSync(path.join(output, 'tools')), ['jsx']);
    assert.ok(!readdirSync(output).some(name => ['.git', 'convex', '.env.local', 'assets'].includes(name)));
    assert.match(readFileSync(path.join(output, 'robots.txt'), 'utf8'), /Disallow: \//);
    writeFileSync(path.join(output, 'stale.txt'), 'old artifact');
    build();
    assert.ok(!readdirSync(output).includes('stale.txt'));
  } finally { rmSync(output, { recursive: true, force: true }); }
});

test('preview builder refuses to overwrite an unrelated directory', () => {
  const output = mkdtempSync(path.join(tmpdir(), 'jsx-preview-protected-'));
  try {
    writeFileSync(path.join(output, 'keep.txt'), 'keep me');
    assert.throws(() => execFileSync(process.execPath, ['scripts/preview/build-jsx.mjs', output], { stdio: 'pipe' }), /Preview output must be empty/);
    assert.equal(readFileSync(path.join(output, 'keep.txt'), 'utf8'), 'keep me');
  } finally { rmSync(output, { recursive: true, force: true }); }
});
