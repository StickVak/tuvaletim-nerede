# 🚻 Tuvaletim Nerede?

Yakınındaki en temiz ve ücretsiz tuvaleti saniyeler içinde bulan, **PWA uyumlu** web uygulaması.
Masaüstünde tam ekran harita + yan panel, telefonda tam ekran harita + kaydırılabilir alt panel olarak çalışır.

**Teknoloji:** React 18 · Vite · TypeScript · Tailwind CSS · Leaflet (OpenStreetMap) · **IndexedDB (Dexie.js)** · Lucide ikonları
API anahtarı veya ayrı bir sunucu gerekmez.

## Kurulum

```bash
npm install
npm run dev
```

- Uygulama: <http://localhost:5173>
- Yönetim paneli: <http://localhost:5173/admin> → varsayılan giriş **`admin` / `admin123`**

Üretim derlemesi (service worker yalnızca burada devrede):

```bash
npm run build
npm run preview
```

Yönetici bilgilerini değiştirmek için `.env.example` dosyasını `.env` olarak kopyalayıp düzenleyin:

```bash
cp .env.example .env
```

## Veritabanı mimarisi

Veriler tarayıcıda kalıcı **IndexedDB** veritabanında (`tuvaletim-nerede`) tutulur; sayfa yenilense veya tarayıcı kapansa da korunur.
Şema: [`src/db/db.ts`](src/db/db.ts) · işlemler: [`src/db/repo.ts`](src/db/repo.ts)

| Tablo | İçerik |
|---|---|
| `places` | Onaylı mekanlar: konum, tür, şehir/ilçe, ücret (`free` / `customers` / `paid`), saatler, erişilebilirlik, fotoğraf, **puan toplamları ve oy sayısı** |
| `reviews` | Kullanıcı puanları (temizlik, konfor 1-5) ve yorumlar; anonim tarayıcı kimliği (`voterId`) ile |
| `pending_submissions` | `+` ile gönderilen, admin onayı bekleyen mekanlar |
| `admin_users` | Yönetici hesapları (tuzlu SHA-256 şifre özeti, oturum belirteci) |

**Soğuk başlangıç (seed):** Veritabanı ilk oluşturulduğunda Dexie'nin `populate` olayıyla otomatik olarak **38 mekan** eklenir
(İzmir'de 24: Buca, Konak, Bornova, Karşıyaka, Alsancak, Balçova, Gaziemir… · İstanbul'da 8 · Ankara'da 6) ve varsayılan yönetici hesabı oluşturulur.
Kaynak: [`src/db/seed.ts`](src/db/seed.ts).

> ⚠️ Seed verilerindeki **puanlar, oy sayıları ve çalışma saatleri temsilidir**, koordinatlar yaklaşıktır. Uygulamada bu kayıtlar “Örnek veri” etiketiyle gösterilir.

Veritabanını sıfırlamak için: tarayıcı geliştirici araçları → Application → IndexedDB → `tuvaletim-nerede` → Delete database, ardından sayfayı yenileyin.

## Özellikler

### Kullanıcı arayüzü
- **Masaüstü (≥1024 px):** tam ekran OpenStreetMap; solda ACİL butonu, arama, sıralama ve “sadece ücretsiz” filtresiyle mekan listesi olan yan panel; sağda yakınlaştırma, konum ve `+` butonları.
- **Mobil:** sol üstte ayarlar, sağda yüzen butonlar, altta sürüklenebilir alt panel (sol üst köşesinde **ACİL**).
- **Mekan detayı ve puanlama:** pine veya liste kartına dokununca açılır. Temizlik ve konfor ortalamaları, oy sayısı, son yorumlar, Google Maps yol tarifi, 1-5 yıldız + kısa yorumla puan verme. Puan anında ortalamaya eklenir.
- **Oy kilidi:** aynı tarayıcıdan aynı mekana **24 saatte bir** puan verilebilir (localStorage + veritabanındaki `voterId` kontrolü).
- **ACİL:** yakındaki **ücretsiz** mekanlar arasından (5 km içinde yoksa “müşteriye ücretsiz”, o da yoksa tümü) yakınlık %60 + puan %40 skoruyla en uygununu seçer, rota çizer, “Hemen Git” kartı açar.
- **Tuvalet ekleme:** haritadan konum seçme, ad, şehir/adres, tür, ücret durumu, puanlar, fotoğraf (sıkıştırılarak base64). Gönderilen kayıt admin onayından sonra haritada görünür.
- Kullanıcı arayüzünde **silme, sıfırlama, harita stili değiştirme veya onay mekanizması yoktur.**

### Yönetim paneli (`/admin`)
Kullanıcı arayüzünde bu sayfaya bir bağlantı yoktur; doğrudan URL ile açılır ve ayrı bir JS paketinde yüklenir.

1. **Giriş:** kullanıcı adı + şifre, 5 hatalı denemede 30 sn bekleme, oturum `sessionStorage` + veritabanındaki belirteçle doğrulanır (8 saat).
2. **Genel Bakış:** onaylı mekan, bekleyen başvuru, toplam puan/yorum, ağırlıklı ortalama temizlik; son puanlamalar; şehir dağılımı.
3. **Başvurular:** fotoğraf, mini harita konum önizlemesi, bilgiler → **Onayla (Haritaya Ekle)** / **Reddet**.
4. **Mekanlar:** arama + şehir/tür/ücret/kaynak filtreleri, düzenleme (haritaya tıklayarak konum değiştirme ve fotoğraf dahil), **kalıcı silme** (mekana ait yorumlar da silinir).
5. **Yorumlar:** tüm puan ve yorumlar; silindiğinde mekanın ortalaması otomatik yeniden hesaplanır.

> 🔐 **Güvenlik notu:** Uygulamada sunucu olmadığı için yönetici girişi **istemci tarafında** doğrulanır ve veriler her kullanıcının kendi tarayıcısında durur.
> Bu yapı demo ve tek cihaz kullanımı için uygundur. Gerçek çok kullanıcılı bir yayında veritabanı ve kimlik doğrulama bir sunucuya (ör. SQLite + Express) taşınmalıdır.
> `VITE_` ile başlayan ortam değişkenleri derlenen JS paketine gömülür.

## Proje yapısı

```
src/
├─ main.tsx                 # "/" → App, "/admin" → AdminApp (lazy)
├─ App.tsx                  # Harita uygulaması (responsive masaüstü/mobil)
├─ types.ts
├─ db/
│  ├─ db.ts                 # Dexie şeması, populate (seed + admin), eski localStorage verisini taşıma
│  ├─ seed.ts               # 38 mekan + demo konumu
│  └─ repo.ts               # Puanlama, oy kilidi, başvuru, onay/red, düzenleme, silme
├─ lib/                     # geo (mesafe, ACİL), route (OSRM), sha256, image, categories, mapIcons
├─ hooks/                   # useMediaQuery, useGeolocation, usePersistentState, useElementHeight
├─ components/              # MapView, Sidebar, BottomSheet, PlaceDetail, EmergencyCard,
│                           # AddToiletModal, FloatingControls, SettingsDrawer, ...
└─ admin/                   # AdminApp, AdminLogin, AdminPanel, Dashboard, PendingPage,
                            # PlacesPage, PlaceEditModal, ReviewsPage, MiniMap, auth
public/                     # manifest, ikonlar, sw.js
```
