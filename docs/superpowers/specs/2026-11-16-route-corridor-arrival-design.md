# Güzergah Üzerinde Bul + Varış Değerlendirmesi (Tasarım)

**Durum:** Onaylandı (2026-11-16) · **Boyut:** küçük-orta

## Amaç
Rota çizildiğinde yol üstündeki diğer tuvaletleri öne çıkarmak; hedefe varınca hızlı değerlendirme alıp katkıyı kaydetmek.

## Kararlar
1. **Koridor:** `src/lib/corridor.ts` saf fonksiyon — tuvaletin rota çizgisine (segment) en kısa mesafesi; **≤ 150 m** "Rota Üzerinde 📍".
   Hedef hariç. Kuş uçuşu (yaklaşık) rotada da uygulanır. Hesap istemcide; sunucu çağrısı yok.
2. **"Yol Üstündekileri Göster"** anahtarı rota kartında; açıkken liste ve harita yalnızca koridordakiler + hedef.
3. **Varış:** GPS konumu hedefe **≤ 20 m** (rota başına bir kez) ya da "Rotayı Bitir" → Varış ve Değerlendirme penceresi. "Atla" var.
   Elle işaretlenmiş konumda otomatik algılama yok (konum değişmez). Girişsiz kullanıcıya giriş önerilir.
4. **Pencere:** Temizlik ★ + Konfor ★ (mevcut model), Ücretsiz/Ücretli (+ isteğe bağlı tutar), "Açık mıydı?", "Kağıt var mıydı?".
   Açık = Hayır → puan sorulmaz, yalnızca `closed` bildirimi. Kağıt = Hayır → `no_supplies` bildirimi.
5. **API:** `POST /api/places/:id/arrival` `{ wasOpen, hadPaper?, cleanliness?, comfort?, isPaid?, priceAmount? }` — tek işlemde
   oy upsert (açıksa) + durum bildirimleri (`open`/`closed`, gerekirse `no_supplies`). Yanıt: `{ place, contributions }`.
   Mevcut yazma hız sınırı ve giriş zorunluluğu geçerli.
6. **Katkı:** yeni puan sistemi yok; katkı = oy sayısı + durum bildirimi sayısı; profil istatistiklerinde `contributions`.
   Aynı mekana tekrar puan eskisinin yerine geçer; bildirimler her varışta yeni katkıdır.
   Not: mevcut "aynı kullanıcı + tür 3 saatte bir" tekilleştirmesi varış bildirimlerinde de geçerli.

## Hedef dışı
Sunucu tarafı rota analizi, yeni "genel puan" alanı, puan/rozet oyunlaştırması, arka planda konum izleme.
