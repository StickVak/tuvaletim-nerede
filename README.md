# 🚻 Tuvaletim Nerede?

İzmir'de yakınındaki en uygun tuvaleti bulan, puanların ve ücret bilgisinin **kullanıcı oylarıyla** oluştuğu, PWA uyumlu web uygulaması.

- **Arayüz:** React 18 · Vite · TypeScript · Tailwind CSS · Leaflet (OpenStreetMap) · Lucide
- **Sunucu:** Node.js · Express · SQLite (**sql.js** — saf WebAssembly, Windows dahil hiçbir sistemde C++ derlemesi gerektirmez)

## Kurulum

Gerekli: **Node.js 22.6 veya üzeri**.

```bash
npm install
cp .env.example .env      # Windows (cmd): copy .env.example .env
npm run dev
```

`npm run dev` tek komutla iki süreci birlikte başlatır (`concurrently`):

| Süreç | Adres |
|---|---|
| Arayüz (Vite) | <http://localhost:5173> |
| Yönetim paneli | <http://localhost:5173/admin> |
| API (Express) | <http://localhost:3001/api> — Vite `/api` isteklerini buraya yönlendirir |

İlk açılışta `server/data/tuvaletim.db` oluşturulur ve İzmir başlangıç verisi yüklenir.
Veritabanını sıfırlamak için sunucuyu durdurup `server/data/` klasörünü silmeniz yeterli.

Diğer komutlar:

```bash
npm test          # sunucu (node:test) + Acil algoritması testleri
npm run build     # üretim derlemesi (dist/)
```

### Ortam değişkenleri (`.env`, yalnızca sunucu okur)

| Değişken | Açıklama | Varsayılan |
|---|---|---|
| `AUTH_SECRET` | Oturum belirteçlerini imzalayan gizli anahtar. Tanımlı değilse ya da `.env.example`'daki örnek değer bırakılmışsa sunucu rastgele bir anahtar üretip `server/data/.auth-secret`'e kaydeder. | otomatik üretilir |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | Yönetici hesabı; sunucu her açılışta bu hesabı oluşturur veya şifresini eşitler | `admin` / `admin123` |
| `PORT` | API portu | `3001` |

## Özellikler

- **Gerçek konum:** Açılışta tarayıcının konum izni istenir ve harita GPS konumunuza odaklanır. İzin verilmezse veya konum alınamazsa üstte bir uyarı çıkar; haritada bulunduğunuz noktaya dokunarak konumunuzu işaretlersiniz (yalnızca o oturum için). Konum yokken harita İzmir merkezli açılır.
- **Acil:** 2 km içindeki **ücretsiz** tuvaletler arasından yakınlık (%70) ve puan (%30) ağırlıklı en uygununu seçer; oylanmamış mekan puanda nötr sayılır. 2 km içinde ücretsiz tuvalet yoksa en yakın tuvaleti gösterir. Yürüme rotası çizilir, “Hemen Git” Google Maps'i açar.
- **Hesaplar:** Kayıt Ol / Giriş Yap. Tuvalet eklemek ve puan vermek için giriş gerekir.
- **Kitle kaynaklı puan ve ücret:**
  - Başlangıç verisinde hiç puan yoktur (`Henüz puanlanmadı · 0 oy`).
  - Puanlama: Temizlik ★1-5, Konfor ★1-5, altında **Ücretli / Ücretsiz**; Ücretli seçilince **Ücret Tutarı (₺)** alanı açılır. İsteğe bağlı kısa yorum.
  - Her kullanıcının her mekana **tek oyu** vardır; tekrar oy verirse oyu güncellenir.
  - Ücret durumu **oy çoğunluğuyla** belirlenir. Oy yokken veya eşitlikte tür varsayılanı geçerlidir: **AVM ücretsiz, diğer tüm türler ücretli**.
  - Ücretli görünen mekanda tutar girilmiş oyların ortalaması gösterilir: `Ücretli • Ort. 12,5 ₺`.
- **Tema:** Sistem / Açık / Koyu (Ayarlar). Varsayılan cihaz teması; koyu temada harita da koyulaşır.
- **Düzen:** Masaüstünde (≥1024 px) tam ekran harita + sol kenar paneli; telefonda alt panel.
- **Yönetim paneli (`/admin`):** Yalnızca `role = admin` hesaplar. Genel bakış; başvuruları onaylama/reddetme (fotoğraf ve konum önizlemesiyle); mekan arama, düzenleme ve kalıcı silme; oy/yorum moderasyonu (silinen oy istatistiklerden düşer).

## Veritabanı (SQLite)

Şema: [`server/db.js`](server/db.js)

| Tablo | İçerik |
|---|---|
| `users` | id, username, email, password_hash (scrypt), role (`user` / `admin`), created_at |
| `places` | Onaylı mekanlar: ad, tür, ilçe, adres, konum, fotoğraf, saatler, engelli erişimi, bebek bakım, kaynak (`seed` / `user`) |
| `votes` | cleanliness, comfort, is_paid, price_amount, comment, user_id, place_id — `UNIQUE(user_id, place_id)` |
| `pending_places` | `+` ile gönderilen, onay bekleyen mekanlar ve ekleyenin ilk oyu (onayda `votes`'a yazılır) |

Puan ve ücret durumu saklanmaz; her istekte oylardan hesaplanır ([`server/stats.js`](server/stats.js)).

## Başlangıç verisi (İzmir)

[`server/seed-places.json`](server/seed-places.json): **177 mekan** — 29 AVM, 38 Starbucks/kafe, 12 belediye tuvaleti, 98 diğer kamuya açık tuvalet. Tüm İzmir ilini kapsar.

- Koordinatlar OpenStreetMap / **Nominatim**'den alınmıştır ve gerçek OSM nesnelerine aittir. Her kaydın `osm` alanında OSM kimliği yer alır.
- Engelli erişimi, bebek bakım ve çalışma saatleri, varsa OSM etiketlerinden gelir. Puan veya oy sayısı **yoktur**.
- Adı istenen 24 noktanın 22'si doğrudan bir OSM kaydına oturur. Şu ikisinin yakınında OSM'de kayıtlı tuvalet olmadığından referans noktasına **yaklaşık** yerleştirilmiştir (`approximate: true`, adreste “(yaklaşık konum)” yazar): *Bornova Merkez Meydan Belediye WC* (Cumhuriyet Meydanı) ve *Karşıyaka İskele / Çarşı Belediye WC* (Karşıyaka Vapur İskelesi). Doğru konum `/admin` → Mekanlar → Düzenle'den haritaya tıklanarak düzeltilebilir.
- Operatörü belediye olarak işaretlenmemiş, adsız kamu tuvaletleri “Umumi Tuvalet – ‹mahalle›” adıyla eklenmiştir.

Veriyi yeniden üretmek için (Nominatim kullanım kuralına uygun: saniyede en fazla 1 istek, yanıtlar `scripts/.nominatim-cache.json`'da önbelleğe alınır):

```bash
node scripts/geocode-seed.mjs > server/seed-places.json
```

Seed verisi yalnızca veritabanı boşken yüklenir.

## API

| Yöntem | Yol | Yetki | Açıklama |
|---|---|---|---|
| POST | `/api/auth/register` | — | `{ username, email?, password }` → `{ token, user }` |
| POST | `/api/auth/login` | — | `{ username (veya e-posta), password }` → `{ token, user }` |
| GET | `/api/auth/me` | kullanıcı | Oturumdaki kullanıcı |
| GET | `/api/places` | — | Mekanlar + `stats` (+ girişliyse `myVote`) |
| GET | `/api/places/:id/photo` | — | Mekan fotoğrafı (liste yanıtında yalnızca `hasPhoto` bulunur) |
| GET | `/api/places/:id/reviews` | — | Yorumlu son 20 oy |
| PUT | `/api/places/:id/vote` | kullanıcı | `{ cleanliness, comfort, isPaid, priceAmount?, comment? }` — oy ekler/günceller |
| POST | `/api/pending` | kullanıcı | Yeni mekan başvurusu (+ ilk oy) |
| GET | `/api/admin/stats` | admin | Özet sayılar |
| GET | `/api/admin/pending` | admin | Bekleyen başvurular |
| POST / DELETE | `/api/admin/pending/:id/approve`, `/api/admin/pending/:id` | admin | Onayla / reddet |
| PATCH / DELETE | `/api/admin/places/:id` | admin | Düzenle / kalıcı sil (oylarıyla birlikte) |
| GET / DELETE | `/api/admin/votes`, `/api/admin/votes/:id` | admin | Oy listesi / oy sil |

Hatalarda gövde her zaman `{ "error": "<Türkçe mesaj>" }` biçimindedir.

## Güvenlik notları

- Şifreler `scrypt` ile tuzlanarak saklanır. Oturum, `AUTH_SECRET` ile HMAC-SHA256 imzalı 7 günlük bir belirteçtir; tarayıcıda `localStorage`'da tutulur. Kullanıcının rolü her istekte veritabanından okunur.
- Örnek (herkese açık) anahtar asla kullanılmaz; yoksa rastgele üretilir.
- Fotoğraflar yalnızca JPEG / PNG / WebP / GIF olabilir (SVG reddedilir) ve `X-Content-Type-Options: nosniff` ile sunulur.
- Yönetici bilgileri yalnızca sunucudadır, tarayıcıya gönderilen JS paketinde bulunmaz.
- Giriş denemelerinde hız sınırı (rate limit) yoktur ve HTTPS kurulumu bu projenin kapsamında değildir. İnternete açmadan önce bir ters vekil sunucu (reverse proxy) ve hız sınırı ekleyin.
- Telefonda gerçek GPS için tarayıcılar HTTPS ister (`localhost` hariç).

## Proje yapısı

```
server/
  index.js            # .env okur, uygulamayı 3001'de başlatır
  app.js              # createApp(): Express + yönetici hesabı
  db.js               # sql.js aç/kaydet, şema, seed
  auth.js  stats.js  validate.js
  routes/             # auth, places, pending, admin
  seed-places.json    # İzmir başlangıç verisi
  test/               # node:test
scripts/geocode-seed.mjs
src/
  api.ts              # fetch sarmalayıcı
  hooks/              # useAuth, usePlaces, useGeolocation, useTheme, …
  components/         # MapView, Sidebar, BottomSheet, PlaceDetail, AuthModal, LocationBanner, …
  admin/              # /admin paneli
  lib/geo.ts          # mesafe + Acil algoritması (geo.test.ts)
docs/superpowers/     # tasarım ve uygulama planı
```
