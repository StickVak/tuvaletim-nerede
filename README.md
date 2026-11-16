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
npm test          # sunucu (node:test) + Acil, rota, koridor, filtre testleri
npm run build     # üretim derlemesi (dist/)
npm run seed:demo # mevcut veritabanına örnek kullanıcı + yorum ekler (sunucu kapalıyken)
```

### Ortam değişkenleri (`.env`, yalnızca sunucu okur)

| Değişken | Açıklama | Varsayılan |
|---|---|---|
| `AUTH_SECRET` | Oturum belirteçlerini imzalayan gizli anahtar. Tanımlı değilse ya da `.env.example`'daki örnek değer bırakılmışsa sunucu rastgele bir anahtar üretip `server/data/.auth-secret`'e kaydeder. | otomatik üretilir |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | Yönetici hesabı; sunucu her açılışta bu hesabı oluşturur veya şifresini eşitler | `admin` / `admin123` |
| `PORT` | API portu | `3001` |
| `SEED_DEMO_DATA` | `false` ise yeni veritabanına örnek kullanıcı ve yorum eklenmez | `true` |

## Özellikler

- **Gerçek konum:** Açılışta tarayıcının konum izni istenir ve harita GPS konumunuza odaklanır. İzin verilmezse veya konum alınamazsa üstte bir uyarı çıkar; haritada bulunduğunuz noktaya dokunarak konumunuzu işaretlersiniz (yalnızca o oturum için). Konum yokken harita İzmir merkezli açılır.
- **Acil:** 2 km içindeki **ücretsiz** tuvaletler arasından yakınlık (%70) ve puan (%30) ağırlıklı en uygununu seçer; oylanmamış mekan puanda nötr sayılır. 2 km içinde ücretsiz tuvalet yoksa en yakın tuvaleti gösterir. “Hemen Git” uygulama içi yol tarifine geçer.
- **Uygulama içi yol tarifi:** Liste kartındaki, detay penceresindeki “Yol Tarifi” ve Acil'deki “Hemen Git” kullanıcıyı dışarı yönlendirmez; konumunuzdan tuvalete sokaklara oturan yaya rotası haritada çizilir. Üstteki kartta yürüme mesafesi, tahmini süre ve **Rotayı Bitir** bulunur. Rota motoru OSRM'dir ([`src/lib/route.ts`](src/lib/route.ts)): önce gerçek yaya profili olan `routing.openstreetmap.de`, yanıt vermezse `router.project-osrm.org` denenir. Genel demo sunucusu yalnızca araç profili çalıştırdığından orada süre yürüme hızından (4,8 km/sa) hesaplanır. İkisi de yanıt vermezse kesikli kuş uçuşu çizgi çizilir.
- **Hesaplar:** Kayıt Ol / Giriş Yap. Tuvalet eklemek, puan vermek, favori ve durum bildirimi için giriş gerekir.
- **Profilim:** Sağ üstteki avatar/ada tıklayınca açılır. Görünen ad, biyografi (160 karakter), şifre ve profil fotoğrafı (JPEG/PNG/WebP/GIF, en fazla 2 MB) değiştirilebilir; fotoğraf yoksa baş harflerden sarı-siyah avatar gösterilir. Oy/yorum, eklenen tuvalet ve favori sayıları ile etkinlik geçmişi bulunur.
- **Herkese açık profiller:** Yorumlardaki ada/avatara tıklayınca kullanıcının fotoğrafı, adı, biyografisi, katılım tarihi, katkı sayıları ve tüm değerlendirmeleri görünür. Şifre, e-posta ve rol asla dönmez.
- **Güzergah üzerinde bul:** Rota çizildiğinde rota çizgisine en fazla **150 m** uzaklıktaki diğer tuvaletler listede ve haritada **Rota Üzerinde 📍** rozetiyle öne çıkar (bu pinler kümeye girmez). Rota kartındaki **Yol Üstündekileri Göster** anahtarı listeyi ve haritayı yalnızca bunlara ve hedefe indirir ([`src/lib/corridor.ts`](src/lib/corridor.ts)).
- **Varış ve değerlendirme:** Rota aktifken GPS konumu hedefe **20 m** yaklaşınca (rota başına bir kez) ya da **Rotayı Bitir**'e basılınca ekranın ortasında değerlendirme penceresi açılır: Açık mıydı?, Kağıt var mıydı?, Temizlik ★, Konfor ★, Ücretsiz / Ücretli. Gönderince oy ve durum bildirimleri tek seferde kaydedilir, “Katkın için teşekkürler! 💧” mesajıyla toplam katkı sayısı gösterilir ve rota kapanır. “Kapalıydı” yanıtında puan sorulmaz, yalnızca kapalı bildirimi kaydedilir. Katkı = verilen oy sayısı + durum bildirimi sayısı (Profilim'de görünür).
- **Filtreler ve sıralama:** Birlikte seçilebilen çipler — Ücretsiz, Engelli Erişimi, Bebek Bakımı, Şu An Açık, Şifresiz / Herkese Açık, Alafranga, Alaturka, Favorilerim — ve En Yakın / En Temiz / En Ucuz-Ücretsiz / En Çok Oylanan sıralaması.
- **Canlı durum:** Mekan detayından tek tıkla “Temizlik / Tadilat Nedeniyle Kapalı”, “Kağıt / Sabun Yok”, “Çok Kalabalık” bildirimi. Son 3 saatte en az 2 farklı kullanıcı kapalı bildirirse kartta, detayda ve pinde **Geçici Olarak Kapalı Bildirildi** rozeti çıkar ve Acil o mekanı atlar.
- **Favoriler:** Kart ve detaydaki kalp ikonu.
- **Harita kümeleme:** `leaflet.markercluster`; uzaklaşınca yakın pinler sarı-siyah sayı baloncuklarında toplanır (koyu temada ters renkler). Seçili mekan ve rota hedefi kümeye girmez.
- **Örnek veriler:** İlk kurulumda 6 kurgusal İzmirli kullanıcı (çizim avatarlı) ve 9 popüler mekanda 18 gerçekçi oy/yorum eklenir. Bu profiller arayüzde **Örnek profil** olarak işaretlidir; şifreleri rastgele olduğundan bu hesaplarla giriş yapılamaz. Diğer mekanlar oysuz kalır.
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
| `votes` | cleanliness, comfort, is_paid, price_amount, comment, toilet_type, user_id, place_id — `UNIQUE(user_id, place_id)` |
| `pending_places` | `+` ile gönderilen, onay bekleyen mekanlar ve ekleyenin ilk oyu (onayda `votes`'a yazılır) |
| `favorites` | user_id, place_id, created_at — birincil anahtar `(user_id, place_id)` |
| `status_reports` | place_id, user_id, report_type (`closed` / `no_supplies` / `crowded`), created_at |

`users` ayrıca display_name, avatar_url, bio, is_demo; `places` ayrıca toilet_type, public_access, added_by içerir. Bu sütunlar eski veritabanlarına açılışta `ALTER TABLE` ile eklenir.

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
| GET | `/api/places/:id/reviews` | — | Yorumlu son 20 oy (yazarın görünen adı ve avatarıyla) |
| POST | `/api/places/:id/arrival` | kullanıcı | `{ wasOpen, hadPaper?, cleanliness, comfort, isPaid, priceAmount? }` varış değerlendirmesi → `{ place, contributions }` |
| POST | `/api/places/:id/reports` | kullanıcı | `{ type: 'closed' \| 'no_supplies' \| 'crowded' \| 'open' }` canlı durum bildirimi |
| PUT / DELETE | `/api/favorites/:placeId` | kullanıcı | Favoriye ekle / çıkar |
| GET / PATCH | `/api/profile` | kullanıcı | Profilim (istatistik + etkinlik) / ad ve biyografi |
| POST | `/api/profile/password` | kullanıcı | `{ currentPassword, newPassword }` |
| PUT / DELETE | `/api/profile/avatar` | kullanıcı | `{ image: dataURL }` profil fotoğrafı yükle / kaldır |
| GET | `/api/users/:id` | — | Herkese açık profil |
| GET | `/api/avatars/:file` | — | Profil fotoğrafı (`nosniff`) |
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
- **Hız sınırı (IP başına, bellek içi):** giriş + kayıt 15 dakikada 20 istek; oy, bildirim, favori, başvuru ve profil yazma dakikada 60 istek. Aşılınca `429` ve `Retry-After`. Sunucu yalnızca kendi makinesindeki (loopback) vekilin `X-Forwarded-For` başlığına güvenir.
- Profil fotoğrafları içerik baytları kontrol edilerek kabul edilir, rastgele adla `server/data/avatars/` altında tutulur.
- HTTPS kurulumu bu projenin kapsamında değildir; internete açmadan önce bir ters vekil sunucu (reverse proxy) ile HTTPS ekleyin.
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
  lib/route.ts        # OSRM yaya rotası + kuş uçuşu yedeği (route.test.ts)
docs/superpowers/     # tasarım ve uygulama planı
```
