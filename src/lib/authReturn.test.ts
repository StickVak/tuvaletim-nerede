import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readAuthReturn, stripAuthParams } from './authReturn.ts';

test('Google dönüşü: başarı ve yeni hesap mesajları', () => {
  assert.deepEqual(readAuthReturn('?auth=google'), { tone: 'success', text: 'Google ile giriş yapıldı.' });
  assert.equal(readAuthReturn('?auth=google&new=1')?.tone, 'success');
  assert.match(readAuthReturn('?auth=google&new=1')!.text, /kaydınız oluşturuldu/);
});

test('Google dönüşü: hata kodları anlaşılır Türkçe mesaja; bilinmeyen kod genel mesaja', () => {
  assert.match(readAuthReturn('?auth_error=cancelled')!.text, /iptal/);
  assert.match(readAuthReturn('?auth_error=state')!.text, /süresi doldu/);
  assert.match(readAuthReturn('?auth_error=email_unverified')!.text, /doğrulanmamış/);
  assert.match(readAuthReturn('?auth_error=account_conflict')!.text, /başka bir Google hesabına/);
  assert.equal(readAuthReturn('?auth_error=<script>')!.text, 'Google ile giriş tamamlanamadı. Lütfen tekrar deneyin.');
  assert.equal(readAuthReturn('?auth_error=token')!.tone, 'error');
});

test('ilgisiz adreslerde null; URL temizlenir, diğer parametreler korunur', () => {
  assert.equal(readAuthReturn(''), null);
  assert.equal(readAuthReturn('?q=konak'), null);
  assert.equal(stripAuthParams('https://x.app/?auth=google&new=1'), '/');
  assert.equal(stripAuthParams('https://x.app/?q=konak&auth_error=state#harita'), '/?q=konak#harita');
});
