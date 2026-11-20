import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatWait, resendLabel, retryHint, secondsLeft, sendButton, waitSecondsFromError } from './otp.ts';

test('bekleme: sunucunun retryAfter değeri esas; 429 için varsayılan 60; diğer hatalarda yok', () => {
  assert.equal(waitSecondsFromError({ status: 503, retryAfter: 37 }), 37);
  assert.equal(waitSecondsFromError({ status: 429, retryAfter: 12.2 }), 13);
  assert.equal(waitSecondsFromError({ status: 429, retryAfter: null }), 60);
  assert.equal(waitSecondsFromError({ status: 400, retryAfter: null }), null);
  assert.equal(waitSecondsFromError({ status: 0 }), null);
  assert.equal(waitSecondsFromError(null), null);
});

test('geri sayım saniyeleri yukarı yuvarlanır, geçmişte 0', () => {
  const now = 1_000_000;
  assert.equal(secondsLeft(now + 14_100, now), 15);
  assert.equal(secondsLeft(now + 1, now), 1);
  assert.equal(secondsLeft(now - 5000, now), 0);
});

test('biçim ve ipucu metinleri', () => {
  assert.equal(formatWait(5), '0:05');
  assert.equal(formatWait(75), '1:15');
  assert.equal(retryHint(37), '37 saniye sonra tekrar deneyebilirsiniz.');
  assert.equal(retryHint(90), '1:30 sonra tekrar deneyebilirsiniz.');
  assert.equal(retryHint(0), 'Şimdi tekrar deneyebilirsiniz.');
});

test('Kod Gönder butonu: istek sürerken ve bekleme varken kilitli', () => {
  assert.deepEqual(sendButton({ busy: true, wait: 0 }), { label: 'Kod gönderiliyor…', disabled: true });
  assert.deepEqual(sendButton({ busy: true, wait: 30 }), { label: 'Kod gönderiliyor…', disabled: true });
  assert.deepEqual(sendButton({ busy: false, wait: 27 }), { label: 'Tekrar dene (0:27)', disabled: true });
  assert.deepEqual(sendButton({ busy: false, wait: 0 }), { label: 'Kod Gönder', disabled: false });
});

test('tekrar gönder metni', () => {
  assert.equal(resendLabel({ busy: true, wait: 10 }), 'Gönderiliyor…');
  assert.equal(resendLabel({ busy: false, wait: 59 }), 'Kodu tekrar gönder (0:59)');
  assert.equal(resendLabel({ busy: false, wait: 0 }), 'Kodu tekrar gönder');
});

test('hata başlığı: nedenine göre; süre içermez (geri sayım ayrı gösterilir)', async () => {
  const { failureTitle } = await import('./otp.ts');
  assert.equal(failureTitle({ status: 503, reason: 'rate_limit', message: 'E-posta servisi şu an yoğun. 37 saniye sonra tekrar deneyin.' }), 'E-posta servisi şu an yoğun.');
  assert.equal(failureTitle({ status: 503, reason: 'network' }), 'Doğrulama e-postası şu an gönderilemedi.');
  assert.equal(failureTitle({ status: 503, reason: 'unavailable' }), 'E-posta servisi geçici olarak kullanılamıyor.');
  assert.equal(failureTitle({ status: 429, message: 'Yeni kod için 40 saniye bekleyin.' }), 'Bu adrese kısa süre önce kod gönderildi.');
  assert.equal(failureTitle({ status: 409, message: 'Bu e-posta ile kayıtlı bir hesap var.' }), 'Bu e-posta ile kayıtlı bir hesap var.');
  for (const t of [failureTitle({ reason: 'rate_limit' }), failureTitle({ status: 429 })]) assert.ok(!/\d/.test(t));
});
