# Backend, Auth & Kitle Kaynaklı Puanlama — Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dexie/IndexedDB yerine Express + sql.js REST backend; kullanıcı hesapları; oylarla belirlenen puan/ücret; gerçek GPS; sade Acil; Sistem/Açık/Koyu tema; yalnızca İzmir seed'i.

**Architecture:** `server/` düz JavaScript (ESM) Express uygulaması; sql.js veritabanını bellekte tutar, her yazmada `server/data/tuvaletim.db`'ye yazar. Puan/ücret istatistikleri saf bir fonksiyonla oylardan hesaplanır ve `GET /api/places` yanıtına eklenir. Frontend mevcut bileşenleri korur; veri katmanı `src/api.ts` + `useAuth` + `usePlaces` ile değişir.

**Tech Stack:** Node 22 · Express 4 · sql.js 1.x · node:crypto (scrypt, HMAC) · node:test · React 18 + Vite 5 + Tailwind 3 · Leaflet · concurrently

**Spec:** `docs/superpowers/specs/2026-11-16-backend-auth-crowdsourcing-design.md`

## Global Constraints
- Native derleme gerektiren paket yok (sqlite3, bcrypt yasak). Yeni bağımlılıklar yalnızca: `express`, `sql.js`, `concurrently`.
- Seed **yalnızca İzmir**; hiçbir seed kaydında oy/puan yok. Tür varsayılanı: `avm` → ücretsiz, diğer tüm türler → ücretli.
- Ücret etiketi metni: `Ücretsiz`, `Ücretli`, ortalama varsa `Ücretli • Ort. 12,5 ₺` (Türkçe ondalık virgül).
- Oy yoksa puan metni: `Henüz puanlanmadı`, sayaç `0 oy`.
- Acil butonu: düz `#EF4444` (Tailwind `red-500`), gölge/nabız animasyonu yok, ikon + `Acil`.
- Acil algoritması: 2000 m içindeki ücretsizler; yoksa en yakın mekan.
- Varsayılan harita merkezi (konum yokken): İzmir Konak `38.4189, 27.1287`, zoom 13.
- Tema anahtarı `tn.theme` ∈ `system | light | dark`, varsayılan `system`.
- Sunucu portu `3001`; Vite `/api` → `http://localhost:3001` proxy.
- Admin hesabı `.env`'den: `ADMIN_USERNAME` (vars. `admin`), `ADMIN_PASSWORD` (vars. `admin123`), `AUTH_SECRET`. Bunlar `VITE_` öneki taşımaz.
- Kullanıcı arayüzünde demo konumu, demo ayarı, silme ve onay mekanizması yok (mevcut kural korunur).

## Review Focus
1. **Aynı kullanıcı ikinci kez oy verir** → yeni satır değil, mevcut oy güncellenir; `voteCount` artmaz. (Task 2 testi)
2. **Ücretli oyunda tutar boş / negatif / metin** → boş kabul edilir (ortalamaya girmez); negatif veya > 1000 → 400. (Task 2 testi)
3. **Oylar eşit (1 ücretli, 1 ücretsiz)** → tür varsayılanı kullanılır. (Task 2 testi)
4. **Süresi dolmuş ya da sahte belirteç** → 401; arayüz oturumu temizler ve giriş modalını açar. (Task 1 testi + Task 8)
5. **Konum izni yok + Acil'e basılır** → uygulama çökmez; "Önce haritada konumunuzu işaretleyin" uyarısı. (Task 7/10 e2e)

---

## Dosya Yapısı
```
server/
  index.js          # app.listen(3001) — yalnızca başlatma
  app.js            # createApp({ dbPath }) → Express app (testler bunu kullanır)
  db.js             # openDb(path) → { all, get, run, save } ; şema ; seed çağrısı
  auth.js           # hashPassword, verifyPassword, signToken, verifyToken, requireUser, requireAdmin
  stats.js          # computeStats(category, votes[]) → PlaceStats (saf)
  routes/auth.js    routes/places.js    routes/pending.js    routes/admin.js
  seed-places.json  # Nominatim ile doğrulanmış İzmir seed'i (commit edilir)
  data/             # tuvaletim.db (gitignore)
  test/*.test.js    # node:test
scripts/geocode-seed.mjs   # seed-places.json üretir (bir kez çalıştırılır)
src/api.ts                 # fetch sarmalayıcı + tipler
src/hooks/useAuth.tsx      # AuthProvider, useAuth()
src/hooks/usePlaces.ts     # usePlaces() → { places, refresh }
src/hooks/useTheme.ts      # useTheme() → [setting, setSetting]
src/components/AuthModal.tsx, src/components/AccountButton.tsx, src/components/LocationBanner.tsx
src/lib/geo.test.ts        # node --experimental-strip-types --test
Silinir: src/db/*, src/lib/sha256.ts, src/admin/auth.ts (yerine api), dexie bağımlılıkları
```

## Paylaşılan tipler (`src/types.ts`, sunucu yanıtıyla birebir)
```ts
type ToiletCategory = 'avm' | 'kafe' | 'belediye' | 'park' | 'diger';
interface PlaceStats { voteCount: number; cleanliness: number; comfort: number; rating: number; isPaid: boolean; avgPrice: number | null }
interface Vote { cleanliness: number; comfort: number; isPaid: boolean; priceAmount: number | null; comment: string | null }
interface Place { id: string; name: string; category: ToiletCategory; district: string | null; address: string | null;
  lat: number; lng: number; photo: string | null; hours: string | null; accessible: boolean; babyChanging: boolean;
  source: 'seed' | 'user'; createdAt: string; stats: PlaceStats; myVote: Vote | null }
interface User { id: number; username: string; role: 'user' | 'admin' }
interface PlaceView extends Place { distance: number | null }   // konum yoksa null
```

---

### Task 1: Sunucu iskeleti, veritabanı şeması ve kimlik doğrulama

**Files:** Create `server/{index,app,db,auth}.js`, `server/routes/auth.js`, `server/test/auth.test.js`, `.env.example`; Modify `package.json`, `vite.config.ts`, `.gitignore`

**Interfaces — Produces:**
- `openDb(path: string): Promise<Db>`; `Db = { all(sql, params?) → rows[], get(sql, params?) → row|undefined, run(sql, params?) → { lastId, changes }, save() }`. `run` her çağrıdan sonra `save()` yapar. Dosya yoksa oluşturur; `places` boşsa `seed-places.json`'dan doldurur (dosya yoksa boş geçer).
- Şema: `users(id INTEGER PK, username TEXT UNIQUE COLLATE NOCASE, email TEXT UNIQUE, password_hash TEXT, role TEXT CHECK(role IN ('user','admin')), created_at TEXT)`; `places(id TEXT PK, name, category, district, address, lat REAL, lng REAL, photo, hours, accessible INT, baby_changing INT, source TEXT, created_at, updated_at)`; `votes(id INTEGER PK, place_id TEXT REFERENCES places ON DELETE CASCADE, user_id INTEGER REFERENCES users ON DELETE CASCADE, cleanliness INT, comfort INT, is_paid INT, price_amount REAL, comment TEXT, created_at, updated_at, UNIQUE(user_id, place_id))`; `pending_places(id TEXT PK, …places alanları…, user_id, cleanliness, comfort, is_paid, price_amount, comment, submitted_at)`. `PRAGMA foreign_keys=ON`.
- `createApp({ dbPath, secret }): Promise<express.App>` — `express.json({ limit: '6mb' })`, `/api/auth/*`; açılışta `.env` admin'ini `role='admin'` ile oluşturur/şifresini eşitler.
- `hashPassword(pw) → 'scrypt$salt$hash'`, `verifyPassword(pw, stored) → boolean` (timingSafeEqual), `signToken({ id, role }, secret) → string` (base64url payload + HMAC-SHA256, `exp` = 7 gün), `verifyToken(token, secret) → payload|null`.
- Middleware: `requireUser` (401 `{ error }`), `requireAdmin` (403), `optionalUser` (req.user varsa).
- `POST /api/auth/register { username, email?, password }` → `201 { token, user }`; `POST /api/auth/login { username, password }` (username veya e-posta) → `200 { token, user }`; `GET /api/auth/me` → `{ user }`.
- Doğrulama: username 3–30, `^[\p{L}\p{N}_.-]+$`u; password ≥ 6; email varsa `x@y.z`. Hata gövdesi her zaman `{ error: '<Türkçe mesaj>' }`.

- [ ] **Step 1:** `npm i express@4 sql.js@1.12.0 && npm i -D concurrently@9 && npm rm dexie dexie-react-hooks`; scripts: `"dev": "concurrently -k -n api,web -c yellow,cyan \"node --watch server/index.js\" \"vite --host\""`, `"test": "node --test server/test && node --experimental-strip-types --test src/lib/geo.test.ts"`; `vite.config.ts` → `server.proxy` ve `preview.proxy` `{ '/api': 'http://localhost:3001' }`; `.gitignore` → `server/data/`.
- [ ] **Step 2: Failing tests** `server/test/auth.test.js` (her test geçici dosyada `createApp`, rastgele portta `listen`, `fetch`):
  - `register returns token and user role user` → 201, `user.role === 'user'`, token string
  - `duplicate username (case-insensitive) → 409`
  - `short password → 400`
  - `login wrong password → 401`, `login by email → 200`
  - `me with valid token → user`; `me with tampered token → 401`; `me with expired token → 401` (signToken'a `exp` geçmiş verilerek)
  - `env admin can login with role admin`
- [ ] **Step 3:** Run `node --test server/test` → FAIL (modül yok).
- [ ] **Step 4:** Implement files above.
- [ ] **Step 5:** Run `node --test server/test` → PASS.
- [ ] **Step 6:** Commit `feat(server): express + sql.js iskeleti ve kimlik doğrulama`.

### Task 2: İstatistik hesabı, mekan listesi ve oylama API'si

**Files:** Create `server/stats.js`, `server/routes/places.js`, `server/test/stats.test.js`, `server/test/places.test.js`; Modify `server/app.js`

**Interfaces — Produces:**
- `computeStats(category: string, votes: {cleanliness, comfort, is_paid, price_amount}[]) → PlaceStats`. Ortalama = basit ortalama; `rating = (cleanliness + comfort) / 2`; oy yoksa üçü de `0`. `isPaid`: ücretli oy > ücretsiz oy → true; ücretsiz > ücretli → false; eşitse `category !== 'avm'`. `avgPrice`: `isPaid` ise `price_amount > 0` olan ücretli oyların ortalaması (1 ondalığa yuvarla), yoksa `null`.
- `GET /api/places` (optionalUser) → `Place[]` (`stats` + giriş yapan kullanıcı için `myVote`, yoksa `null`). Boolean alanlar `true/false`.
- `PUT /api/places/:id/vote` (requireUser) body `{ cleanliness 1–5 tamsayı, comfort 1–5, isPaid boolean, priceAmount number|null, comment ≤280 }` → `200 Place`. UPSERT (`ON CONFLICT(user_id, place_id) DO UPDATE`). `isPaid=false` ise `price_amount` NULL. `priceAmount` < 0 veya > 1000 → 400. Mekan yoksa 404.

- [ ] **Step 1: Failing tests** `stats.test.js`:
  - `no votes: avm free, kafe paid, belediye paid, voteCount 0, avgPrice null`
  - `majority paid with prices [10, 15, null] → isPaid true, avgPrice 12.5`
  - `majority free on kafe → isPaid false, avgPrice null`
  - `tie on avm → false; tie on kafe → true`
  - `averages: votes (5,4),(3,2) → cleanliness 4, comfort 3, rating 3.5`
  `places.test.js`:
  - `GET /api/places returns seeded places with voteCount 0` (test seed: 2 kayıtlık geçici JSON)
  - `vote without token → 401`
  - `vote then re-vote updates same row: voteCount stays 1, myVote reflects second vote`
  - `two users paid 10 and 15 → stats.avgPrice 12.5, isPaid true`
  - `priceAmount -5 → 400; cleanliness 6 → 400; unknown place → 404`
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run `node --test server/test` → PASS.
- [ ] **Step 5:** Commit `feat(server): oylardan puan ve ücret hesabı`.

### Task 3: Nominatim ile doğrulanmış İzmir seed'i

**Files:** Create `scripts/geocode-seed.mjs`, `server/seed-places.json`, `server/test/seed.test.js`

**Interfaces — Produces:** `server/seed-places.json`: `[{ id: 'seed-<slug>', name, category, district, address, lat, lng, hours, accessible, babyChanging, osm: { type, id, display_name }, approximate: boolean }]` — puan alanı yok.

Script kuralı: her kayıt için `{ name, category, district, query, near? }` listesi. Nominatim `search?format=json&countrycodes=tr&viewbox=26.85,38.55,27.35,38.25&bounded=1`, istekler arası ≥ 1.1 sn, `User-Agent: tuvaletim-nerede-seed/1.0`. AVM/Starbucks → isimle ara, `class=shop|amenity` sonucu al. Belediye WC → `near` (meydan/park) önce geokodlanır, sonra o noktanın ±0.004° kutusunda `q=toilets` aranır; en yakın `amenity=toilets` seçilir; yoksa `near` noktası kullanılır ve `approximate: true`. Bulunamayan kayıt script sonunda listelenir (sessizce atlanmaz).

Liste (kullanıcının spesifikasyonu): AVM — İzmir Optimum (Gaziemir), Forum Bornova, İstinyePark İzmir (Balçova), Agora (Balçova), Hilltown Karşıyaka, MaviBahçe (Karşıyaka), Konak Pier, Point Bornova, Ege Perla (Bayraklı). Kafe — Starbucks Buca Forbes/DEÜ Tınaztepe çevresi, Şirinyer İZBAN çevresi kafe, Starbucks Alsancak Kıbrıs Şehitleri, Starbucks Konak Pier, Starbucks Bornova Küçükpark, Starbucks Karşıyaka Çarşı, Starbucks Bostanlı Sahil. Belediye — Buca Hasanağa Bahçesi, Şirinyer Parkı/İZBAN, Konak Meydanı/Kemeraltı Girişi, Alsancak Kordon/Gündoğdu, Kültürpark (Fuar), Bornova Merkez Meydan, Karşıyaka İskele/Çarşı, Bostanlı Sahil.

- [ ] **Step 1: Failing test** `seed.test.js`: `seed has 24 İzmir places`; `every lat in [38.25, 38.55] and lng in [26.85, 27.35]`; `no rating fields present`; `ids unique`; `categories: 9 avm, 7 kafe, 8 belediye`.
- [ ] **Step 2:** Run → FAIL (dosya yok).
- [ ] **Step 3:** Write and run `node scripts/geocode-seed.mjs > server/seed-places.json`; elle kontrol: `approximate` kayıtları ve OSM adları raporlanır.
- [ ] **Step 4:** Run `node --test server/test` → PASS.
- [ ] **Step 5:** Commit `feat(server): Nominatim ile doğrulanmış İzmir seed verisi`.

### Task 4: Başvuru ve admin API'si

**Files:** Create `server/routes/pending.js`, `server/routes/admin.js`, `server/test/admin.test.js`; Modify `server/app.js`

**Interfaces — Produces:**
- `POST /api/pending` (requireUser) body `{ name 3–60, category, lat, lng, district?, address?, photo? (data:image/… ≤ 5 MB), hours?, accessible?, babyChanging?, vote: { cleanliness, comfort, isPaid, priceAmount, comment? } }` → `201 { id }`.
- requireAdmin: `GET /api/admin/stats → { places, pending, votes, users, avgCleanliness }`; `GET /api/admin/pending → PendingPlace[]` (+ `username`); `POST /api/admin/pending/:id/approve → Place` (place + submitter oyu tek işlemde); `DELETE /api/admin/pending/:id`; `PATCH /api/admin/places/:id` (Place alanları, stats hariç) → Place; `DELETE /api/admin/places/:id` (oylar cascade); `GET /api/admin/votes → (Vote & { id, placeId, placeName, username, createdAt })[]`; `DELETE /api/admin/votes/:id`.

- [ ] **Step 1: Failing tests** `admin.test.js`: `pending without token → 401`; `normal user on /api/admin/stats → 403`; `submit → appears in admin pending, not in /api/places`; `approve → in /api/places with voteCount 1 and submitter's isPaid`; `reject removes pending`; `patch place name`; `delete place removes its votes`; `delete vote recalculates stats (voteCount 0)`.
- [ ] **Step 2:** FAIL → **Step 3:** Implement → **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(server): başvuru ve admin API`.

### Task 5: Frontend veri katmanı (Dexie → REST)

**Files:** Create `src/api.ts`, `src/hooks/useAuth.tsx`, `src/hooks/usePlaces.ts`; Modify `src/types.ts`, `src/main.tsx`, `src/App.tsx`, `src/lib/geo.ts`, `src/lib/categories.ts`, `src/components/{ToiletListItem,Badges,EmergencyCard,Sidebar}.tsx`; Delete `src/db/`, `src/lib/sha256.ts`

**Interfaces — Produces:**
- `api.ts`: `api<T>(path, { method?, body? }) → Promise<T>`; `Authorization: Bearer` `localStorage['tn.token']`'dan; hata → `ApiError { status, message }` (sunucu `error` metni). 401 → token silinir ve `window` üzerinde `tn-auth-expired` olayı.
- `useAuth()` → `{ user: User|null, login(u,p), register(u,e,p), logout(), requireAuth(): boolean }` — `requireAuth` girişli değilse `AuthModal`'ı açar ve `false` döner. `AuthProvider` hem `App` hem `AdminApp`'i sarar.
- `usePlaces()` → `{ places: Place[] | undefined, refresh(): Promise<void>, error }`.
- `feeLabel(stats: PlaceStats) → string` (Global Constraints'teki metin; `categories.ts`).
- `toView(p: Place, user: LatLng | null): PlaceView`.
- Kaldırılanlar: `FeeType`, `customers`, `city`, `cleanlinessTotal/…`, `source`'a dayalı "Örnek veri" etiketi korunur (seed = `source: 'seed'`).

- [ ] **Step 1:** Implement; `npm run build` → başarılı, `tsc` hatasız.
- [ ] **Step 2:** `npm run dev` + Playwright: liste 24 mekan, kartlarda `Henüz puanlanmadı` / `0 oy`, AVM'lerde `Ücretsiz`, kafelerde `Ücretli`.
- [ ] **Step 3:** Commit `feat(web): REST veri katmanına geçiş`.

### Task 6: Kimlik doğrulama arayüzü ve yetki kapısı

**Files:** Create `src/components/AuthModal.tsx`, `src/components/AccountButton.tsx`; Modify `src/App.tsx`, `src/components/Sidebar.tsx`

- `AuthModal`: sekmeler `Giriş Yap` / `Kayıt Ol`; alanlar kullanıcı adı (girişte "Kullanıcı adı veya e-posta"), e-posta (yalnızca kayıt, isteğe bağlı), şifre; sunucu hatası alanın altında.
- `AccountButton`: girişsiz → `Giriş Yap` + `Kayıt Ol`; girişli → kullanıcı adı + `Çıkış Yap`. Mobilde üst barın sağında, masaüstünde Sidebar başlığında.
- `+` ve `Puanı Gönder` önce `requireAuth()`.
- [ ] **Step 1:** Implement. **Step 2:** Playwright: girişsiz `+` → modal; kayıt → kullanıcı adı görünür; çıkış → butonlar geri gelir; yenileme sonrası oturum korunur. **Step 3:** Commit `feat(web): giriş/kayıt ve yetki kapısı`.

### Task 7: Gerçek konum ve elle işaretleme

**Files:** Create `src/components/LocationBanner.tsx`; Modify `src/hooks/useGeolocation.ts`, `src/App.tsx`, `src/components/{SettingsDrawer,Sidebar}.tsx`

- `useGeolocation()` → `{ position, status: 'pending'|'granted'|'denied'|'unsupported', retry() }`.
- `App`: `user = gps.position ?? manualLocation ?? null`. Demo konumu, `forceDemoLocation`, `DEMO_*` kaldırılır. İlk GPS konumu gelince haritayı ona uçur.
- `LocationBanner` (status `denied|unsupported` ve `manualLocation` yokken): metin `Konumunuza erişemedik. Haritada bulunduğunuz noktaya dokunun.` + `Tekrar dene`. Bu modda harita tıklaması `manualLocation`'ı ayarlar. Elle konum varken banner gizli; Konum butonu elle konumu yeniden seçtirir.
- Konum yokken liste mesafesiz, ada göre sıralı; mesafe metni gizli.
- [ ] **Step 1:** Implement. **Step 2:** Playwright (izin yok): banner görünür → haritaya tıkla → mavi nokta + mesafeler görünür; (izinli, geolocation=Bornova) → harita Bornova'ya odaklanır, banner yok. **Step 3:** Commit `feat(web): gerçek konum ve elle konum işaretleme`.

### Task 8: Puanlama formu (ücret oyu dahil)

**Files:** Modify `src/components/PlaceDetail.tsx`, `src/components/AddToiletModal.tsx`

- Form: Temizlik ★, Konfor ★, altında yan yana `Ücretli` / `Ücretsiz`; `Ücretli` seçiliyken `Ücret Tutarı (₺)` (`type=number min=0 max=1000 step=0.5`, isteğe bağlı), yorum (≤280). `myVote` varsa form onunla dolu gelir ve buton `Oyumu Güncelle` olur. 24 saat kilidi ve `getVoteLock/countMyVotes` kaldırılır.
- Detay başlığı: `stats.voteCount` → `0 oy` / `Henüz puanlanmadı`; ücret rozeti `feeLabel(stats)`.
- `AddToiletModal`: 3'lü ücret yerine aynı `Ücretli/Ücretsiz + tutar` bileşeni; `POST /api/pending`.
- [ ] **Step 1:** Implement. **Step 2:** Playwright: kafe için 2 kullanıcı (`Ücretli` 10 ve 15) → kartta `Ücretli • Ort. 12,5 ₺`; aynı kullanıcı yeniden oy → `1 oy` değişmez. **Step 3:** Commit `feat(web): oylarla ücret ve puan belirleme`.

### Task 9: Sade Acil butonu ve yeni algoritma

**Files:** Create `src/lib/geo.test.ts`; Modify `src/lib/geo.ts`, `src/App.tsx`, `src/components/Sidebar.tsx`, `src/index.css` (`.sos-ring` silinir)

- `pickEmergency(places: PlaceView[], radiusM = 2000): PlaceView | null` — `distance === null` olanlar yok sayılır. Aday = `!stats.isPaid && distance <= radiusM`. Aday varsa skor `0.7 * (1 - d/maxD) + 0.3 * q`, `q = voteCount ? (rating-1)/4 : 0.5`; yoksa en yakın mekan.
- Buton: `bg-red-500 hover:bg-red-600 text-white rounded-full`, `Siren` ikonu + `Acil`; gölge ve animasyon yok (mobil tab ve masaüstü Sidebar).
- Konum yoksa toast `Önce haritada konumunuzu işaretleyin.`
- [ ] **Step 1: Failing tests** `geo.test.ts`: `prefers free within 2km over nearer paid`; `falls back to nearest when no free within 2km`; `among free, rated 5 at 600m beats unrated at 500m`; `ignores places with null distance`; `returns null for empty list`.
- [ ] **Step 2:** FAIL → **Step 3:** Implement → **Step 4:** `npm test` PASS. **Step 5:** Commit `feat(web): sade Acil butonu ve ücretsiz öncelikli seçim`.

### Task 10: Sistem / Açık / Koyu tema

**Files:** Create `src/hooks/useTheme.ts`; Modify `tailwind.config.js`, `src/index.css`, `src/components/SettingsDrawer.tsx`, gerekli bileşenlerde `bg-white`/`text-ink` → token sınıfları

- Tailwind `darkMode: 'class'`; renkler CSS değişkeni: `surface` (#FFFFFF / #1E1E1E), `card` (#F8F9FA / #2A2A2A), `ink` (#1A1A1A / #F2F2F2), `ink-soft`, `ink-muted`, `line`. Sarı vurgular değişmez. Koyu ve sarı zemin üzerindeki metin için sabit `#1A1A1A` (`text-onbrand`).
- `useTheme()` → `[setting, setSetting]`; `html.classList.toggle('dark', …)`; `system` iken `matchMedia` değişimini dinler. `index.html`'e boyamadan önce sınıfı ayarlayan 3 satırlık inline script.
- Koyu harita: `.dark .leaflet-tile-pane { filter: invert(1) hue-rotate(180deg) brightness(.9) contrast(.9) }`.
- Ayarlar: `Görünüm` → `Sistem / Açık / Koyu` üçlü seçim.
- [ ] **Step 1:** Implement. **Step 2:** Playwright `colorScheme: 'dark'` → `html.dark`, gövde arka planı koyu; Ayarlar'dan `Açık` → açık tema, yenilemede korunur. Ekran görüntüleri ile görsel kontrol (kontrast). **Step 3:** Commit `feat(web): sistem/açık/koyu tema`.

### Task 11: Admin paneli REST'e geçiş

**Files:** Modify `src/admin/{AdminApp,AdminLogin,AdminPanel,Dashboard,PendingPage,PlacesPage,PlaceEditModal,ReviewsPage}.tsx`; Delete `src/admin/auth.ts`

- Giriş `useAuth().login`; `role !== 'admin'` → `Bu hesabın yönetici yetkisi yok.` ve çıkış. Veriler admin uç noktalarından; her işlemden sonra yeniden yükleme.
- Dashboard kartları: Onaylı tuvalet, Bekleyen başvuru, Toplam oy, Ortalama temizlik, Kayıtlı kullanıcı.
- Mekanlar: ücret filtresi `isPaid` (Ücretli/Ücretsiz); ücret düzenleme alanı kaldırılır (oylarla belirlenir); `city` filtresi → `district`.
- Yorumlar sayfası → `Oylar`: kullanıcı adı, temizlik/konfor, `Ücretli 12 ₺` / `Ücretsiz`, yorum, sil.
- [ ] **Step 1:** Implement. **Step 2:** Playwright: normal kullanıcı /admin → yetki hatası; admin → başvuru onay, düzenleme, mekan silme, oy silme sonrası istatistik güncel. **Step 3:** Commit `feat(admin): SQLite API ile uyum`.

### Task 12: Belgeler ve uçtan uca doğrulama

**Files:** Modify `README.md`, `public/sw.js` (`/api/` istekleri asla önbelleğe alınmaz; önbellek sürümü `v3`)

- [ ] **Step 1:** README: kurulum (`npm install`, `cp .env.example .env`, `npm run dev`), API tablosu, veritabanı tabloları, seed'in Nominatim ile nasıl üretildiği ve `approximate` kayıtlar, güvenlik notu.
- [ ] **Step 2:** Temiz klon simülasyonu: `server/data` sil → `npm run dev` → seed oluşur; `npm test` PASS; `npm run build` PASS; tam Playwright akışı (mobil + masaüstü + admin + koyu tema) konsol hatası yok.
- [ ] **Step 3:** Commit `docs: backend kurulumu ve API`.
