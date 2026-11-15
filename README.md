# 🚻 Tuvaletim Nerede?

Yakınındaki en temiz ve ücretsiz tuvaleti saniyeler içinde bulan, mobilde yerel uygulama hissi veren **PWA uyumlu** web uygulaması.

**Teknoloji:** React 18 + Vite + TypeScript · Tailwind CSS · Leaflet (`react-leaflet`) · Lucide ikonları
**API anahtarı gerekmez** — harita CARTO/OpenStreetMap karolarını, yaya rotası ise ücretsiz OSRM servisini kullanır.

## Kurulum

```bash
npm install
npm run dev
```

Terminalde çıkan adresi (varsayılan `http://localhost:5173`) açın. Aynı Wi‑Fi'daki telefondan `Network:` satırındaki adresle de deneyebilirsiniz.

Üretim derlemesi (service worker yalnızca burada devrede):

```bash
npm run build
npm run preview
```

> Not: Telefonda gerçek GPS için tarayıcılar **HTTPS** ister (localhost hariç). Konum izni yoksa veya örnek verilere 30 km'den uzaksanız uygulama otomatik olarak **demo konumuna (Kadıköy)** geçer. Ayarlar'dan demo konumunu zorunlu da kılabilirsiniz.

## Özellikler

| Alan | Açıklama |
|---|---|
| **Harita** | Tam ekran (`100dvh`) Leaflet haritası, 3 stil (Modern/Voyager, Sade/Positron, Standart/OSM). Kullanıcı konumu mavi yanıp sönen nokta. |
| **Pinler** | Sarı‑beyaz özel pinler, kategori ikonları (AVM, Kafe, Belediye, Park), ücretsizlerde yeşil “Ücretsiz” rozeti. |
| **Sağ kontroller** | Filtre & sıralama (yakınlık / temizlik puanı / sadece ücretsiz), Konumuma odaklan, sarı `+` Tuvalet ekle. Butonlar alt panelle birlikte hareket eder. |
| **Alt panel** | Sürüklenebilir / dokununca açılan bottom sheet (3 kademe). Liste: fotoğraf, mesafe, yürüme süresi, yıldızlar, Google Maps “Yol Tarifi”. Pin'e dokununca detay görünümü. |
| **ACİL** | Panelin sol üst çıkıntısındaki kırmızı buton. Ücretsiz tuvaletler arasından mesafe (%60) + puan (%40) skoruyla en uygununu seçer, haritayı odaklar, kesikli sarı/mavi rota çizer, üstte “Hemen Git” kartı açar. Rota servisine ulaşılamazsa kuş uçuşu çizgiye düşer. |
| **Tuvalet ekleme** | Haritaya dokunarak konum seçme (veya “Konumum”), ad, tür, ücretli/ücretsiz, temizlik & konfor yıldızları, engelli/bebek bakım, saatler, fotoğraf yükleme (`FileReader` → base64, kota için otomatik küçültülür). |
| **Onay akışı** | Gönderilenler “Onay Bekliyor” listesine düşer. Ayarlar › **Admin Onay Paneli**'nden onaylanınca haritada görünür; reddedilebilir. |
| **Kalıcılık** | Onaylı/bekleyen kayıtlar, ayarlar ve filtreler `localStorage`'da tutulur. |
| **PWA** | Manifest, ikonlar, service worker (uygulama kabuğu + gezilen harita karoları önbelleklenir). “Ana ekrana ekle” ile tam ekran uygulama gibi açılır. |
| **Masaüstü** | Ortada şık bir telefon çerçevesi içinde (`max-w-md`) çalışır. |

## Proje yapısı

```
src/
├─ App.tsx                    # Durum yönetimi, ACİL mantığı, ekleme/onay akışı
├─ types.ts
├─ data/seed.ts               # 8 örnek tuvalet (Kadıköy) + demo konumu
├─ lib/
│  ├─ geo.ts                  # Mesafe, format, Google Maps linki, ACİL seçim skoru
│  ├─ route.ts                # OSRM yaya rotası (zaman aşımında düz çizgi)
│  ├─ image.ts                # FileReader + canvas sıkıştırma
│  └─ categories.ts           # Kategori meta + yer tutucu fotoğraf üretici
├─ hooks/                     # usePersistentState, useGeolocation, useElementHeight
└─ components/
   ├─ MapView.tsx             # Leaflet harita, pinler, rota, konum seçimi
   ├─ BottomSheet.tsx         # Sürüklenebilir alt panel
   ├─ FloatingControls.tsx    # Filtre / konum / ekle butonları
   ├─ ToiletListItem.tsx, ToiletDetail.tsx, EmergencyCard.tsx
   ├─ SettingsDrawer.tsx      # Ayarlar + Admin Onay Paneli
   ├─ AddToiletModal.tsx      # Yeni tuvalet formu
   └─ StarRating.tsx, Badges.tsx, Toasts.tsx, Logo.tsx
public/                       # manifest, ikonlar, sw.js
```
