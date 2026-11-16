import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EXAMPLE_SECRET, resolveSecret } from '../secret.js';

const tmp = () => mkdtempSync(join(tmpdir(), 'tn-secret-'));

test('a real AUTH_SECRET from env is used as-is', () => {
  const dir = tmp();
  assert.equal(resolveSecret('cok-gizli-ve-uzun-bir-anahtar-123456', dir).secret, 'cok-gizli-ve-uzun-bir-anahtar-123456');
  rmSync(dir, { recursive: true });
});

test('missing or example secret → random secret generated, persisted and reused', () => {
  for (const env of [undefined, '', EXAMPLE_SECRET]) {
    const dir = tmp();
    const first = resolveSecret(env, dir);
    assert.equal(first.generated, true);
    assert.notEqual(first.secret, EXAMPLE_SECRET);
    assert.ok(first.secret.length >= 32);
    assert.equal(readFileSync(join(dir, '.auth-secret'), 'utf8').trim(), first.secret);
    const second = resolveSecret(env, dir);
    assert.equal(second.secret, first.secret);
    assert.equal(second.generated, false);
    rmSync(dir, { recursive: true });
  }
});

test('.env.example ships the value treated as unsafe', () => {
  const example = readFileSync(new URL('../../.env.example', import.meta.url), 'utf8');
  assert.match(example, new RegExp(`AUTH_SECRET=${EXAMPLE_SECRET}`));
});
