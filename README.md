# 🚻 Tuvaletim Nerede?

İzmir'de yakınındaki en uygun tuvaleti bulan, puanların ve ücret bilgisinin **kullanıcı oylarıyla** oluştuğu, PWA uyumlu web uygulaması.

- **Arayüz:** React 18 · Vite · TypeScript · Tailwind CSS · Leaflet (OpenStreetMap) · Lucide
- **Sunucu:** Node.js · Express · SQLite / **libSQL** (`@libsql/client`: yerelde dosya, canlıda **Turso** bulut veritabanı) · fotoğraflar yerelde diskte, canlıda **Cloudinary**'de

## Kurulum

Gerekli: **Node.js 22.6 veya üzeri**.

```bash
npm install
cp .env.example .env      # Windows (cmd): copy .env.example .env
npm run dev
```

`npm run dev` tek komutla dört süreci birlikte başlatır (`concurrently`):

| Süreç | Adres |
|---|---|
| Uygulama (Vite) | <http://localhost:5173> |
| API (Express) | <http://localhost:3001/api> — Vite `/api` isteklerini buraya yönlendirir |
| Yönetim paneli arayüzü (Vite) | <http://localhost:5174> |
| Yönetim paneli sunucusu (Express) | <http://localhost:3002> — panelin `/api` ve `/auth` isteklerini karşılar |

Yönetim paneline **yönetici anahtarı** (`ADMIN_SECRET_KEY`) ile girilir. `.env`'de tanımlı değilse ana sunucu ilk açılışta
rastgele bir anahtar üretip `server/data/.admin-key` dosyasına yazar; panele bu dosyadaki değerle girin.

İlk açılışta `server/data/tuvaletim.db` oluşturulur ve İzmir başlangıç verisi yüklenir.
Veritabanını sıfırlamak için sunucuyu durdurup `server/data/` klasörünü silmeniz yeterli.

Diğer komutlar:

```bash
npm test             # sunucu + admin paneli sunucusu (node:test) + Acil, rota, koridor, filtre testleri
npm run build        # uygulama derlemesi (dist/)
npm run build:admin  # yönetim paneli derlemesi (admin/dist/)
```

### Ortam değişkenleri (`.env`, yalnızca sunucu okur)

| Değişken | Açıklama | Varsayılan |
|---|---|---|
| `AUTH_SECRET` | Oturum belirteçlerini imzalayan gizli anahtar. Tanımlı değilse ya da `.env.example`'daki örnek değer bırakılmışsa sunucu rastgele bir anahtar üretip `server/data/.auth-secret`'e kaydeder. | otomatik üretilir |
| `ADMIN_SECRET_KEY` | Yönetim API'sinin ve panelin tek anahtarı (en az 16 karakter). **Ana servis ve admin servisinde aynı olmalı.** Yerelde tanımsızsa `server/data/.admin-key`'e üretilir. | otomatik üretilir (yerel) |
| `PORT` | API portu | `3001` |
| `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` | Tanımlıysa veritabanı **Turso** bulutunda (`libsql://…`); yoksa yerel `server/data/tuvaletim.db` | — (yerel dosya) |
| `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` | Üçü de tanımlıysa mekan ve profil fotoğrafları **Cloudinary**'ye yüklenir, veritabanına kalıcı `secure_url` yazılır; yoksa `server/data/photos` ve `server/data/avatars` | — (yerel disk) |
| `ADMIN_PORT` | Yönetim paneli sunucusunun portu (Render'da `PORT` kullanılır) | `3002` |
| `MAIN_API_URL` | Panel sunucusunun bağlanacağı ana sunucu adresi | `http://localhost:3001` |
| `MAIN_APP_URL` | Paneldeki “Uygulamayı aç” bağlantısı (verilmezse `MAIN_API_URL`) | — |
| `RESEND_API_KEY` | Kayıt doğrulama kodlarını [Resend](https://resend.com) ile gönderir (öncelikli) | — |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | Resend yoksa Nodemailer ile SMTP (465 → TLS) | port `587` |
| `MAIL_FROM` | Gönderen adres (Resend'de doğrulanmış alan adı olmalı) | Resend: `onboarding@resend.dev`, SMTP: `SMTP_USER` |

E-posta servisi tanımlı değilse doğrulama kodları **sunucu konsoluna** yazılır (`[mail] … için doğrulama kodu: 123456`) — yerel geliştirme için.
| `TRUST_PROXY` | Ters vekil (Render vb.) arkasında gerçek istemci IP'si için Express `trust proxy` değeri, ör. `1` | — |

### Üretimde çalıştırma (Render: iki ücretsiz Web Service)

Uygulama ve yönetim paneli **iki ayrı servistir**. Veritabanı (SQLite) yalnızca ana serviste durur; panel verilere
ana servisin `/api/admin` uçlarından, `X-Admin-Key: <ADMIN_SECRET_KEY>` başlığıyla erişir.

```
tarayıcı ──► tuvaletim-admin (admin/server)  ──X-Admin-Key──►  tuvaletim-nerede (server/)  ──► SQLite
             anahtarla giriş, httpOnly çerez                     /api/admin/* yalnızca anahtarla
```

**Kolay yol: Blueprint.** Render → **New → Blueprint** → bu depoyu seçin. [`render.yaml`](render.yaml) iki servisi oluşturur,
`AUTH_SECRET` ve `ADMIN_SECRET_KEY`'i üretir ve anahtarı admin servisine de aktarır. Kurulumda yalnızca admin servisinin
`MAIN_API_URL` değeri sorulur: ana servisin adresini girin (ör. `https://tuvaletim-nerede.onrender.com`).
Panele girmek için anahtarı Render → tuvaletim-nerede → **Environment** → `ADMIN_SECRET_KEY` alanından kopyalayın.

**Elle kurulum** (ana servis zaten varsa):

| | Ana servis (mevcut) | Admin servisi (yeni Web Service, aynı depo) |
|---|---|---|
| Build Command | `npm install && npm run build` | `npm install && npm run build:admin` |
| Start Command | `npm start` | `npm run start:admin` |
| Environment | `AUTH_SECRET`, `ADMIN_SECRET_KEY`, `TRUST_PROXY=1` | **aynı** `ADMIN_SECRET_KEY`, `MAIN_API_URL=https://<ana-servis>.onrender.com`, `TRUST_PROXY=1` |

Anahtar üretmek için: `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`.
Ana serviste `ADMIN_SECRET_KEY` tanımlı değilse yönetim API'si erişilemez olur (Render'da her dağıtımda değişen bir anahtar üretilir).

Ücretsiz planda servisler 15 dakika boşta kalınca uyur; panel ilk istekte ana servisi uyandırır (~1 dakika).

### Kalıcı veri: Turso + Cloudinary (Render ücretsiz planı için gerekli)

Render'ın ücretsiz planında yerel disk kalıcı değildir: uyku, yeniden başlatma ya da dağıtımda `server/data/` sıfırlanır.
Bu yüzden canlıda veritabanı ve fotoğraflar harici servislerde tutulur (ikisinin de ücretsiz planı yeterlidir):

1. **Turso** (veritabanı): <https://turso.tech> → hesap açın → yeni veritabanı oluşturun (bölge olarak Render servisinize yakın olanı seçin).
   Veritabanı sayfasından **URL**'yi (`libsql://…turso.io`) ve **Create Token** ile bir erişim belirteci alın.
   CLI ile: `turso db create tuvaletim` · `turso db show tuvaletim --url` · `turso db tokens create tuvaletim`.
2. **Cloudinary** (fotoğraflar): <https://cloudinary.com> → hesap açın → **Dashboard / API Keys** sayfasındaki
   *Cloud name*, *API Key* ve *API Secret* değerlerini alın.
3. Render → **ana servis** → **Environment**: `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `CLOUDINARY_CLOUD_NAME`,
   `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` ekleyin (Blueprint ilk kurulumda bunları sorar). Admin servisine gerekmez.
4. Açılış loglarında `[db] Turso (…)` ve `[foto] Cloudinary (…)` satırlarını görmelisiniz. Şema ve İzmir başlangıç
   verisi Turso'ya ilk açılışta otomatik kurulur.

Yerel veritabanınızı Turso'ya taşımak isterseniz: `turso db create tuvaletim --from-file server/data/tuvaletim.db`
(yerel fotoğraflar Cloudinary'ye taşınmaz; yerelde kalır).

## Özellikler

- **Gerçek konum:** Açılışta tarayıcının konum izni istenir ve harita GPS konumunuza odaklanır. İzin verilmezse veya konum alınamazsa üstte bir uyarı çıkar; haritada bulunduğunuz noktaya dokunarak konumunuzu işaretlersiniz (yalnızca o oturum için). Konum yokken harita İzmir merkezli açılır.
- **Acil:** 2 km içindeki **ücretsiz** tuvaletler arasından yakınlık (%70) ve puan (%30) ağırlıklı en uygununu seçer; oylanmamış mekan puanda nötr sayılır. 2 km içinde ücretsiz tuvalet yoksa en yakın tuvaleti gösterir. “Hemen Git” uygulama içi yol tarifine geçer.
- **Uygulama içi yol tarifi:** Liste kartındaki, detay penceresindeki “Yol Tarifi” ve Acil'deki “Hemen Git” kullanıcıyı dışarı yönlendirmez; konumunuzdan tuvalete sokaklara oturan yaya rotası haritada çizilir. Üstteki kartta yürüme mesafesi, tahmini süre ve **Rotayı Bitir** bulunur. Rota motoru OSRM'dir ([`src/lib/route.ts`](src/lib/route.ts)): önce gerçek yaya profili olan `routing.openstreetmap.de`, yanıt vermezse `router.project-osrm.org` denenir. Genel demo sunucusu yalnızca araç profili çalıştırdığından orada süre yürüme hızından (4,8 km/sa) hesaplanır. İkisi de yanıt vermezse kesikli kuş uçuşu çizgi çizilir.
- **Hesaplar:** Kayıt Ol / Giriş Yap. Tuvalet eklemek, puan vermek, favori ve durum bildirimi için giriş gerekir.
  - **E-posta doğrulamalı kayıt:** Kullanıcı adı, e-posta (zorunlu, benzersiz) ve şifre girilip **Kod Gönder** denir; e-postaya 6 haneli kod gelir. Kod 10 dakika geçerlidir, en fazla 5 hatalı deneme hakkı vardır; aynı adrese 60 saniyede bir kod istenebilir (geri sayımlı **Kodu Tekrar Gönder**). Kodlar veritabanında düz metin değil HMAC olarak tutulur.
  - **Kararlı gönderim:** Her gönderim denemesi 8 sn ile sınırlıdır; zaman aşımı, ağ hatası ve sağlayıcının geçici (5xx / SMTP 4xx) hatalarında kısa bir beklemeyle **aynı kod** 1 kez yeniden gönderilir. Hatalar `timeout / network / rate_limit / provider / config` olarak loglanır (adres maskeli, kod yazılmaz). Zaman aşımında e-posta ulaşmış olabileceğinden kod korunur, kullanıcı kod adımına geçer ve 15 sn sonra yeni kod isteyebilir (`202 delivery: uncertain`). Kesin hatalarda kod silinir ve `503` + `Retry-After` ile ne zaman tekrar denenebileceği bildirilir; kullanıcıya sağlayıcı ayrıntısı gösterilmez.
  - **Arayüz:** Kod isteği sürerken buton kilitlenir (“Kod gönderiliyor…”, çift tıklama/Enter tek istek); bekleme gerekiyorsa saniyelik geri sayım gösterilir (“Tekrar dene (0:27)”, “27 saniye sonra tekrar deneyebilirsiniz.”).
- **Tuvalet ekleme:** **Dış mekan fotoğrafı (giriş / bina cephesi) zorunludur**; fotoğrafsız başvuru gönderilemez. Görsel tarayıcıda küçültülür, sunucuda içerik baytları doğrulanır; Cloudinary tanımlıysa oraya yüklenip kalıcı `secure_url` kaydedilir (gösterimde otomatik biçim/kalite `f_auto,q_auto`), değilse rastgele adla `server/data/photos/` altına yazılır. Mekan silinince ya da başvuru reddedilince görsel Cloudinary'den de silinir. Yönetim panelinde başvuru ve düzenleme ekranlarında büyük önizleme ve tam ekran görüntüleme vardır.
- **Profilim:** Sağ üstteki avatar/ada tıklayınca açılır. Görünen ad, biyografi (160 karakter), şifre ve profil fotoğrafı (JPEG/PNG/WebP/GIF, en fazla 2 MB) değiştirilebilir; fotoğraf yoksa baş harflerden sarı-siyah avatar gösterilir. Oy/yorum, eklenen tuvalet ve favori sayıları ile etkinlik geçmişi bulunur.
- **Herkese açık profiller:** Yorumlardaki ada/avatara tıklayınca kullanıcının fotoğrafı, adı, biyografisi, katılım tarihi, katkı sayıları ve tüm değerlendirmeleri görünür. Şifre, e-posta ve rol asla dönmez.
- **Güzergah üzerinde bul:** Rota çizildiğinde rota çizgisine en fazla **150 m** uzaklıktaki diğer tuvaletler listede ve haritada **Rota Üzerinde 📍** rozetiyle öne çıkar (bu pinler kümeye girmez). Rota kartındaki **Yol Üstündekileri Göster** anahtarı listeyi ve haritayı yalnızca bunlara ve hedefe indirir ([`src/lib/corridor.ts`](src/lib/corridor.ts)).
- **Varış ve değerlendirme:** Rota aktifken GPS konumu hedefe **20 m** yaklaşınca (rota başına bir kez) ya da **Rotayı Bitir**'e basılınca ekranın ortasında değerlendirme penceresi açılır: Açık mıydı?, Kağıt var mıydı?, Temizlik ★, Konfor ★, Ücretsiz / Ücretli. Gönderince oy ve durum bildirimleri tek seferde kaydedilir, “Katkın için teşekkürler! 💧” mesajıyla toplam katkı sayısı gösterilir ve rota kapanır. “Kapalıydı” yanıtında puan sorulmaz, yalnızca kapalı bildirimi kaydedilir. Katkı = verilen oy sayısı + durum bildirimi sayısı (Profilim'de görünür).
- **Filtreler ve sıralama:** Birlikte seçilebilen çipler — Ücretsiz, Engelli Erişimi, Bebek Bakımı, Şu An Açık, Şifresiz / Herkese Açık, Alafranga, Alaturka, Favorilerim — ve En Yakın / En Temiz / En Ucuz-Ücretsiz / En Çok Oylanan sıralaması.
- **Canlı durum:** Mekan detayından tek tıkla “Temizlik / Tadilat Nedeniyle Kapalı”, “Kağıt / Sabun Yok”, “Çok Kalabalık” bildirimi. Son 3 saatte en az 2 farklı kullanıcı kapalı bildirirse kartta, detayda ve pinde **Geçici Olarak Kapalı Bildirildi** rozeti çıkar ve Acil o mekanı atlar.
- **Favoriler:** Kart ve detaydaki kalp ikonu.
- **Harita kümeleme:** `leaflet.markercluster`; uzaklaşınca yakın pinler sarı-siyah sayı baloncuklarında toplanır (koyu temada ters renkler). Seçili mekan ve rota hedefi kümeye girmez.
- **Örnek veri yok:** Kurgusal kullanıcı veya yorum eklenmez; tüm puanlar gerçek kullanıcılardan gelir. Önceki sürümlerin eklediği örnek profiller (`is_demo = 1`) oyları ve avatarlarıyla birlikte açılışta silinir.
- **Kitle kaynaklı puan ve ücret:**
  - Başlangıç verisinde hiç puan yoktur (`Henüz puanlanmadı · 0 oy`).
  - Puanlama: Temizlik ★1-5, Konfor ★1-5, altında **Ücretli / Ücretsiz**; Ücretli seçilince **Ücret Tutarı (₺)** alanı açılır. İsteğe bağlı kısa yorum.
  - Her kullanıcının her mekana **tek oyu** vardır; tekrar oy verirse oyu güncellenir.
  - Ücret durumu **oy çoğunluğuyla** belirlenir. Oy yokken veya eşitlikte tür varsayılanı geçerlidir: **AVM ücretsiz, diğer tüm türler ücretli**.
  - Ücretli görünen mekanda tutar girilmiş oyların ortalaması gösterilir: `Ücretli • Ort. 12,5 ₺`.
- **Uygulama gibi tam ekran (PWA):** Manifest `display: standalone` (adres çubuğu yok). Durum çubuğu ve açılış ekranı rengi uygulama zeminiyle aynıdır, sarı değildir: manifest `theme_color` / `background_color` `#FFFFFF`; `<meta name="theme-color">` açık temada `#FFFFFF`, koyu temada `#1E1E1E` (ilk boyamada satır içi betik, sonra tema değişince `useTheme` günceller; değerler `src/lib/themeColors.ts`). iOS'ta saydam durum çubuğu, içerik çentik/güvenli alanlara göre hizalanır. Projede yerel Android/TWA/Capacitor sarmalayıcısı yoktur. Mobil tarayıcıda açanlara alttan kapatılabilir **“Uygulamayı Ana Ekrana Ekle (Tam Ekran Kullan)”** çubuğu çıkar: Android/Chrome'da `beforeinstallprompt` ile yerleşik kurulum penceresini açar, iOS Safari'de Paylaş → Ana Ekrana Ekle talimatını gösterir. Kapatılınca 14 gün gösterilmez; ana ekrandan açıldığında ve masaüstünde hiç görünmez.
- **Tema:** Sistem / Açık / Koyu (Ayarlar). Varsayılan cihaz teması; koyu temada harita da koyulaşır.
- **Düzen:** Masaüstünde (≥1024 px) tam ekran harita + sol kenar paneli; telefonda alt panel.
- **Yönetim paneli (ayrı servis, [`admin/`](admin/)):** Kullanıcı uygulamasında yönetim kodu yoktur. Panel yalnızca `ADMIN_SECRET_KEY` ile açılır:
  - **Temiz Kalp ihbarları:** Kullanıcıların “Kapalı / Kağıt-sabun yok / Çok kalabalık” bildirimleri mekan başına gruplanır; aynı sorunu **en az 2 farklı kullanıcı** bildirdiyse mekan *şüpheli* sayılır ve üstte listelenir. **Onayla** → mekan *kalıcı kapalı* işaretlenir ve haritadan gizlenir (silinmez, Mekanlar'dan yeniden açılabilir). **Reddet** → ihbarlar çözülür, mekanın canlı durumunu artık etkilemez (kullanıcının katkı sayısında kalır). Tek tek ihbar silinebilir.
  - **Mekanlar:** arama/filtre, yeni mekan ekleme (haritadan konum seçerek), düzenleme, kalıcı kapatma/yeniden açma, kalıcı silme.
  - **Başvurular:** `+` ile gönderilen mekanları onaylama/reddetme.
  - **Kullanıcılar:** oy, yorum, ihbar, eklenen mekan ve son etkinlik; kullanıcı ayrıntısında tek tek oy/ihbar silme ya da kullanıcıyı silme.
  - **Oylar:** oy/yorum moderasyonu (silinen oy istatistiklerden düşer).

## Veritabanı (SQLite / libSQL / Turso)

Şema: [`server/db.js`](server/db.js)

| Tablo | İçerik |
|---|---|
| `users` | id, username, email, password_hash (scrypt), role (`user`), created_at |
| `places` | Onaylı mekanlar: ad, tür, ilçe, adres, konum, fotoğraf, saatler, engelli erişimi, bebek bakım, kaynak (`seed` / `user` / `admin`), `closed_at` (kalıcı kapalı) |
| `votes` | cleanliness, comfort, is_paid, price_amount, comment, toilet_type, user_id, place_id — `UNIQUE(user_id, place_id)` |
| `pending_places` | `+` ile gönderilen, onay bekleyen mekanlar, dış mekan fotoğrafı (`photo_file`) ve ekleyenin ilk oyu (onayda `votes`'a yazılır) |
| `email_codes` | Kayıt doğrulama kodları: email, code_hash (HMAC), expires_at (10 dk), attempts (en fazla 5), sent_at |
| `favorites` | user_id, place_id, created_at — birincil anahtar `(user_id, place_id)` |
| `status_reports` | place_id, user_id, report_type (`closed` / `no_supplies` / `crowded` / `open`), created_at, `resolved_at` (yönetici onayladı/reddetti) |
| `seed_removed` | Yöneticinin sildiği seed mekanları (seed eşitlemesi geri getirmez) |

Eski sürümlerin `role = admin` hesabı (admin/admin123) açılışta silinir; yönetim artık yalnızca anahtarla yapılır.
`users` ayrıca display_name, avatar_url, bio, is_demo; `places` ayrıca toilet_type, public_access, added_by içerir. Bu sütunlar eski veritabanlarına açılışta `ALTER TABLE` ile eklenir.

Puan ve ücret durumu saklanmaz; her istekte oylardan hesaplanır ([`server/stats.js`](server/stats.js)).

## Başlangıç verisi (İzmir)

[`server/seed-places.json`](server/seed-places.json): **184 mekan** — 36 AVM, 38 Starbucks/kafe, 12 belediye tuvaleti, 98 diğer kamuya açık tuvalet. Tüm İzmir ilini kapsar.

- Koordinatlar OpenStreetMap / **Nominatim**'den alınmıştır ve gerçek OSM nesnelerine aittir. Her kaydın `osm` alanında OSM kimliği yer alır.
- Engelli erişimi, bebek bakım ve çalışma saatleri, varsa OSM etiketlerinden gelir. Puan veya oy sayısı **yoktur**.
- Adı istenen 24 noktanın 22'si doğrudan bir OSM kaydına oturur. Şu ikisinin yakınında OSM'de kayıtlı tuvalet olmadığından referans noktasına **yaklaşık** yerleştirilmiştir (`approximate: true`, adreste “(yaklaşık konum)” yazar): *Bornova Merkez Meydan Belediye WC* (Cumhuriyet Meydanı) ve *Karşıyaka İskele / Çarşı Belediye WC* (Karşıyaka Vapur İskelesi). Doğru konum yönetim paneli → Mekanlar → Düzenle'den haritaya tıklanarak düzeltilebilir.
- AVM'ler: il genelinde OSM'de `shop=mall` etiketli ve adı olan tüm kayıtlar (iş hanı, pasaj, çarşı gibi AVM olmayanlar hariç). Migros'un işlettiği AVM'ler OSM'de yalnızca “Migros” adıyla kayıtlı olduğundan “Migros AVM ‹ilçe›” olarak adlandırılır.
- Starbucks: il genelinde OSM'de kayıtlı tüm Starbucks şubeleri. OSM'de olmayan şubeler (özellikle AVM içindekiler) listede yoktur; kullanıcılar sarı **+** butonuyla ekleyebilir.
- Operatörü belediye olarak işaretlenmemiş, adsız kamu tuvaletleri “Umumi Tuvalet – ‹mahalle›” adıyla eklenmiştir.

Veriyi yeniden üretmek için (Nominatim kullanım kuralına uygun: saniyede en fazla 1 istek, yanıtlar `scripts/.nominatim-cache.json`'da önbelleğe alınır):

```bash
node scripts/geocode-seed.mjs > server/seed-places.json
```

Sunucu her açılışta seed dosyasındaki, veritabanında olmayan mekanları ekler; böylece seed'e eklenen yeni mekanlar mevcut kurulumlara da gelir. Yöneticinin panelden sildiği seed mekanları `seed_removed` tablosuna yazılır ve yeniden eklenmez.

## API

| Yöntem | Yol | Yetki | Açıklama |
|---|---|---|---|
| POST | `/api/auth/send-code` | — | `{ email, username? }` → e-postaya 6 haneli kod (`409` kayıtlı e-posta/kullanıcı adı, `429` 60 sn dolmadan) |
| POST | `/api/auth/register` | — | `{ username, email, password, code }` → `{ token, user }` |
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
| POST | `/api/pending` | kullanıcı | Yeni mekan başvurusu (+ ilk oy); `photo` (dış mekan, data URL) zorunlu |
| GET | `/api/health` | — | Sağlık denetimi |

**Yönetim API'si** — her istekte `X-Admin-Key: <ADMIN_SECRET_KEY>` gerekir (anahtarsız/yanlış → `401`, sunucuda anahtar yoksa `503`; hatalı denemeler IP başına 15 dakikada 10 ile sınırlı). Panel bu uçları kendi sunucusu üzerinden çağırır; tarayıcı anahtarı hiç görmez.

| Yöntem | Yol | Açıklama |
|---|---|---|
| GET | `/api/admin/stats` | Özet sayılar (haritadaki/kalıcı kapalı mekan, şüpheli mekan, başvuru, oy, kullanıcı) |
| GET | `/api/admin/reports` | Temiz Kalp ihbar kuyruğu (mekan başına; `flagged` = ≥2 farklı kullanıcı) |
| POST | `/api/admin/reports/:placeId/approve` · `/reject` | Onayla (kalıcı kapat) / reddet |
| DELETE | `/api/admin/report-items/:id` | Tek ihbarı sil |
| GET | `/api/admin/pending` | Bekleyen başvurular (`photo`: fotoğrafın yönetim adresi) |
| GET | `/api/admin/pending/:id/photo` | Başvurunun dış mekan fotoğrafı |
| POST / DELETE | `/api/admin/pending/:id/approve`, `/api/admin/pending/:id` | Onayla / reddet |
| GET / POST | `/api/admin/places` | Tüm mekanlar (kapalılar dahil) / yeni mekan |
| PATCH / DELETE | `/api/admin/places/:id` | Düzenle (`{ closed: true \| false }` dahil) / kalıcı sil |
| GET / DELETE | `/api/admin/votes`, `/api/admin/votes/:id` | Oy listesi / oy sil |
| GET | `/api/admin/users`, `/api/admin/users/:id` | Kullanıcı etkinlik özeti / ayrıntı (oylar, ihbarlar, eklenen mekanlar) |
| DELETE | `/api/admin/users/:id` | Kullanıcıyı sil (oyları ve ihbarlarıyla) |

Hatalarda gövde her zaman `{ "error": "<Türkçe mesaj>" }` biçimindedir.

## Güvenlik notları

- Şifreler `scrypt` ile tuzlanarak saklanır. Oturum, `AUTH_SECRET` ile HMAC-SHA256 imzalı 7 günlük bir belirteçtir; tarayıcıda `localStorage`'da tutulur. Kullanıcının rolü her istekte veritabanından okunur.
- Örnek (herkese açık) anahtar asla kullanılmaz; yoksa rastgele üretilir.
- Fotoğraflar yalnızca JPEG / PNG / WebP / GIF olabilir (SVG reddedilir) ve `X-Content-Type-Options: nosniff` ile sunulur.
- **Yönetim paneli ayrı servistir**; kullanıcı uygulamasının paketinde yönetim kodu yoktur. Yönetim API'si kullanıcı hesaplarıyla açılmaz, yalnızca `ADMIN_SECRET_KEY` ile (sabit süreli karşılaştırma).
- Panel girişinde anahtar tarayıcıda saklanmaz: panel sunucusu anahtardan türetilen anahtarla imzalı, 12 saatlik `HttpOnly; SameSite=Strict` (HTTPS'te `Secure`) bir çerez verir. Çıkış oturumu sunucuda geçersiz kılar; anahtar değişince tüm oturumlar düşer. Değiştiren istekler ayrıca özel bir başlık ister (CSRF). Panel `X-Frame-Options: DENY`, sıkı CSP ve `noindex` ile sunulur; hatalı anahtar denemeleri sınırlıdır.
- **Hız sınırı (IP başına, bellek içi):** giriş + kayıt 15 dakikada 20 istek; oy, bildirim, favori, başvuru ve profil yazma dakikada 60 istek. Aşılınca `429` ve `Retry-After`. Sunucu yalnızca kendi makinesindeki (loopback) vekilin `X-Forwarded-For` başlığına güvenir.
- Profil ve mekan fotoğrafları içerik baytları kontrol edilerek kabul edilir; Cloudinary'ye imzalı istekle (API secret yalnızca sunucuda), tahmin edilemez `public_id` ile yüklenir ya da yerelde rastgele adla `server/data/avatars/` ve `server/data/photos/` altında tutulur (eski sürümlerde veritabanına gömülü fotoğraflar açılışta depoya taşınır).
- Turso'da yabancı anahtar zinciri bağlantıya özel olduğundan mekan/kullanıcı silmede bağlı oy, favori ve bildirimler kodda açıkça, tek işlemde (`batch`) silinir.
- Doğrulama kodu isteği aynı adrese 60 saniyede bir ve IP başına 15 dakikada 10 ile sınırlıdır; kod düz metin saklanmaz.
- HTTPS kurulumu bu projenin kapsamında değildir; internete açmadan önce bir ters vekil sunucu (reverse proxy) ile HTTPS ekleyin.
- Telefonda gerçek GPS için tarayıcılar HTTPS ister (`localhost` hariç).

## Proje yapısı

```
server/
  index.js            # .env okur, uygulamayı 3001'de başlatır
  app.js              # createApp(): Express, yönetim API'si (ADMIN_SECRET_KEY)
  db.js               # libSQL (yerel dosya / Turso): şema, göçler, seed eşitleme, batch işlemler
  photos.js           # fotoğraf deposu: Cloudinary ya da yerel disk
  mailer.js           # e-posta: Resend / SMTP / konsol
  auth.js  stats.js  validate.js
  routes/             # auth, places, pending, admin
  seed-places.json    # İzmir başlangıç verisi
  test/               # node:test
scripts/geocode-seed.mjs
src/
  api.ts              # fetch sarmalayıcı
  hooks/              # useAuth, usePlaces, useGeolocation, useTheme, …
  components/         # MapView, Sidebar, BottomSheet, PlaceDetail, AuthModal, LocationBanner, …
  lib/geo.ts          # mesafe + Acil algoritması (geo.test.ts)
  lib/route.ts        # OSRM yaya rotası + kuş uçuşu yedeği (route.test.ts)
admin/                # bağımsız yönetim paneli (ikinci Render servisi)
  server/             # Express: anahtarla giriş, httpOnly oturum, ana API'ye vekil, admin/dist sunumu
  src/                # React arayüzü (İhbarlar, Başvurular, Mekanlar, Kullanıcılar, Oylar)
  test/               # panel sunucusu entegrasyon testleri
render.yaml           # iki servisli Render Blueprint
docs/superpowers/     # tasarım ve uygulama planı
```
