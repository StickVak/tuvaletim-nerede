# Güzergah + Varış — Uygulama Planı

> Spec: `docs/superpowers/specs/2026-11-16-route-corridor-arrival-design.md` · Yürütme: Native (önceki planla aynı), TDD.

## Global
- Koridor eşiği 150 m, varış eşiği 20 m. Mevcut Express + sql.js, harita ve OSRM yapısı korunur; yeni bağımlılık yok.

## Review Focus
1. Rota 2 noktalı kuş uçuşu → koridor yine çalışmalı. 2. Varış penceresi aynı rotada iki kez açılmamalı (GPS titremesi).
3. `wasOpen=false` iken puan alanları gönderilse bile oy yazılmamalı. 4. Girişsiz `arrival` → 401. 5. Rota kapanınca anahtar sıfırlanmalı.

### Görev 1 — `src/lib/corridor.ts` (TDD)
`distanceToRoute(p: LatLng, route: LatLng[]): number` (m, eşdikdörtgen projeksiyonla segment mesafesi);
`placesOnRoute(places: PlaceView[], route: LatLng[], excludeId: string, maxM = 150): Set<string>`.
Testler (`src/lib/corridor.test.ts`): segment üstü ~0 m; segment ucunun ötesinde uca olan mesafe; 2 noktalı rota;
120 m içeride / 250 m dışarıda; hedef hariç; boş rota → boş küme. `npm test` dosya listesine eklenir.

### Görev 2 — `POST /api/places/:id/arrival` (TDD, `server/test/arrival.test.js`)
401 girişsiz; 404 bilinmeyen mekan; 400 `wasOpen` boolean değil / açıkken yıldız eksik; açık+kağıt yok → oy + `open` + `no_supplies`;
kapalı → yalnızca `closed`, oy yok; yanıtta `contributions` = oylar + bildirimler; profil `stats.contributions`.
`parseVote` yeniden kullanılır; yazmalar `db.tx` içinde.

### Görev 3 — Arayüz
`RouteCard`: "Rota Üzerinde N tuvalet" + "Yol Üstündekileri Göster" anahtarı; "Rotayı Bitir" → varış penceresi.
`ToiletListItem` + pin: "Rota Üzerinde 📍" rozeti. `App`: `onRoute` kümesi (useMemo), filtre, 20 m GPS varış (bir kez).
`ArrivalModal`: sorular, gönder → teşekkür mesajı + rota kapanır; "Atla".

### Görev 4 — Doğrulama + teslim
Tarayıcı: rota → rozet/anahtar; Rotayı Bitir → pencere → gönder → katkı; GPS ile 20 m varış; kapalı akışı; koyu tema kontrastı.
`npm test`, `npm run build`, README, `main`'e commit + push.
