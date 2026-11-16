/** Bellek içi, IP başına sabit pencereli hız sınırlayıcı (tek süreçli sunucu için yeterli). */
export function rateLimit({ windowMs, max }, message = 'Çok fazla istek. Lütfen biraz sonra tekrar deneyin.') {
  const hits = new Map();
  return (req, res, next) => {
    const now = Date.now();
    if (hits.size > 10000) for (const [k, h] of hits) if (h.reset <= now) hits.delete(k);
    let h = hits.get(req.ip);
    if (!h || h.reset <= now) {
      h = { count: 0, reset: now + windowMs };
      hits.set(req.ip, h);
    }
    h.count++;
    if (h.count > max) {
      res.set('Retry-After', String(Math.ceil((h.reset - now) / 1000)));
      return res.status(429).json({ error: message });
    }
    next();
  };
}

export const DEFAULT_LIMITS = {
  /** giriş + kayıt: IP başına 15 dakikada 20 */
  auth: { windowMs: 15 * 60 * 1000, max: 20 },
  /** oy, bildirim, favori, başvuru, profil yazma: IP başına dakikada 60 */
  write: { windowMs: 60 * 1000, max: 60 },
};
