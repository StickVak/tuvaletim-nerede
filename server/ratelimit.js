/**
 * Bellek içi, IP başına sabit pencereli hız sınırlayıcı (tek süreçli sunucu için yeterli).
 * countIf verilirse istek yalnızca yanıt durumu bu koşulu sağlarsa sayılır (ör. yalnızca başarısız girişler).
 */
export function rateLimit({ windowMs, max }, message = 'Çok fazla istek. Lütfen biraz sonra tekrar deneyin.', countIf) {
  const hits = new Map();
  // Süresi dolan kayıtları düzenli temizle (bellek sınırlı kalsın)
  setInterval(() => {
    const now = Date.now();
    for (const [k, h] of hits) if (h.reset <= now) hits.delete(k);
  }, 60 * 1000).unref();
  return (req, res, next) => {
    const now = Date.now();
    let h = hits.get(req.ip);
    if (!h || h.reset <= now) {
      h = { count: 0, reset: now + windowMs };
      hits.set(req.ip, h);
    }
    if (h.count >= max) {
      res.set('Retry-After', String(Math.ceil((h.reset - now) / 1000)));
      return res.status(429).json({ error: message });
    }
    if (countIf) res.on('finish', () => countIf(res.statusCode) && h.count++);
    else h.count++;
    next();
  };
}

export const DEFAULT_LIMITS = {
  /** giriş: IP başına 15 dakikada 10 BAŞARISIZ deneme (başarılı girişler sayılmaz; NAT arkasındakiler kilitlenmez) */
  login: { windowMs: 15 * 60 * 1000, max: 10 },
  /** kayıt: IP başına saatte 10 */
  register: { windowMs: 60 * 60 * 1000, max: 10 },
  /** oy, bildirim, favori, başvuru, profil yazma: IP başına dakikada 60 */
  write: { windowMs: 60 * 1000, max: 60 },
};
