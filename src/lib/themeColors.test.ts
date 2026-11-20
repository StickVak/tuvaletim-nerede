import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SURFACE_COLOR, themeColorFor } from './themeColors.ts';

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const hex = (rgb: string) => '#' + rgb.trim().split(/\s+/).map((n) => Number(n).toString(16).padStart(2, '0')).join('').toUpperCase();
const YELLOW = /#FFD60A|#FFC300/i;

test('durum çubuğu renkleri uygulama zemini (--c-surface) ile aynı', () => {
  const css = read('src/index.css');
  const light = css.match(/:root\s*{[^}]*--c-surface:\s*([\d\s]+);/)![1];
  const dark = css.match(/\.dark\s*{[^}]*--c-surface:\s*([\d\s]+);/)![1];
  assert.equal(SURFACE_COLOR.light, hex(light));
  assert.equal(SURFACE_COLOR.dark, hex(dark));
  assert.equal(themeColorFor(false), '#FFFFFF');
  assert.equal(themeColorFor(true), '#1E1E1E');
});

test('manifest: theme_color ve background_color zeminle uyumlu, sarı değil; tam ekran (standalone)', () => {
  const m = JSON.parse(read('public/manifest.json'));
  assert.equal(m.theme_color, SURFACE_COLOR.light);
  assert.equal(m.background_color, SURFACE_COLOR.light);
  assert.equal(m.display, 'standalone');
  assert.ok(!YELLOW.test(JSON.stringify({ t: m.theme_color, b: m.background_color })));
});

test('index.html: theme-color meta zemin renginde; koyu tema betiği koyu zemini yazar; sarı yok', () => {
  const html = read('index.html');
  const metas = [...html.matchAll(/<meta name="theme-color" content="([^"]+)"/g)].map((x) => x[1]);
  assert.deepEqual(metas, [SURFACE_COLOR.light]);
  assert.ok(html.includes(`setAttribute('content', '${SURFACE_COLOR.dark}')`), 'satır içi betik koyu temada zemin rengini yazar');
  assert.ok(!YELLOW.test(html.match(/<head>[\s\S]*<\/head>/)![0]), 'head içinde sarı renk yok');
});
