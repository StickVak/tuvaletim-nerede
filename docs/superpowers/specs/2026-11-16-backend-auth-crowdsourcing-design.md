# Tuvaletim Nerede? — Backend, Kimlik Doğrulama ve Kitle Kaynaklı Puanlama (Tasarım)

**Durum:** Onaylandı (2026-11-16) · **Boyut:** Proje (kullanıcı kısa plan istedi)

## Amaç
Tarayıcı içi demo yapısından (IndexedDB/Dexie) gerçek, paylaşılan bir backend'e geçmek: tüm kullanıcılar aynı veriyi görsün,
puan ve ücret bilgisi yalnızca gerçek kullanıcı oylarından gelsin, konum gerçek GPS'ten alınsın.

## Hedefler
1. Gerçek konum: demo konumu ve demo ayarı kaldırılır. Açılışta `navigator.geolocation` izni istenir. Reddedilir/alınamazsa üstte
   kibar uyarı; kullanıcı haritaya dokunarak konumunu işaretler. Varsayılan harita merkezi İzmir. Elle konum yalnızca oturum boyunca (bellekte).
2. Sade "Acil" butonu: düz `#EF4444`, abartılı gölge/animasyon yok, ikon + "Acil".
   Algoritma: 2 km içindeki **ücretsiz** mekanlar → en yakın ağırlıklı, oylanmışsa puan katkısı; yoksa en yakın mekan.
3. Tema: Sistem / Açık / Koyu (Ayarlar). Varsayılan `prefers-color-scheme`. CSS renk değişkenleriyle; koyu temada harita karolarına CSS filtresi.
4. Kimlik doğrulama: `users` (id, username, email?, password_hash, role user|admin, created_at). Giriş Yap / Kayıt Ol butonları; girişliyken
   kullanıcı adı + Çıkış Yap. Tuvalet ekleme ve puanlama yalnızca girişli kullanıcılar; değilse giriş/kayıt modalı açılır.
5. Kitle kaynaklı puan & ücret: seed'de sahte puan/oy yok ("Henüz puanlanmadı"). Puanlama: Temizlik, Konfor, altında yan yana
   **Ücretli / Ücretsiz**; Ücretli seçilince "Ücret Tutarı (₺)" sayısal alan. İsteğe bağlı kısa yorum (mevcut özellik, korunur).
   - Ücret durumu = oyların çoğunluğu. Oy yok veya eşitlik → tür varsayılanı: **AVM ücretsiz, diğer tüm türler ücretli**.
   - Ücretli görünüyorsa tutar girilmiş ücretli oyların ortalaması gösterilir: `Ücretli • Ort. 12,5 ₺`.
   - Aynı kullanıcı aynı mekana tekrar oy verirse mevcut oyu güncellenir (24 saatlik yerel kilit kaldırılır).
6. Backend: Node.js + Express + **sql.js** (saf WASM, Windows'ta derleme gerektirmez). Dosya: `server/data/tuvaletim.db`, her yazmada kaydedilir.
   Tablolar: `users`, `places`, `votes` (cleanliness, comfort, is_paid, price_amount, comment, user_id, place_id, UNIQUE(user_id, place_id)),
   `pending_places`. Şifre: Node `crypto.scrypt`. Oturum: HMAC imzalı belirteç (Bearer), sır `.env`'den.
7. Seed (yalnızca İzmir, veritabanı boşsa): **tüm İzmir ili genelinde** AVM'ler, Starbucks şubeleri ve kamuya açık tuvaletler
   (güncelleme 2026-11-16: kullanıcı "verileri tüm İzmir geneli yap" dedi). Kullanıcının adını verdiği 24 nokta mutlaka yer alır.
   Kaynak **Nominatim (OpenStreetMap)**: adlandırılmış noktalar isimle; il geneli tarama bölge bölge (`mall`, `Starbucks`, `toilets`).
   OSM kimliğine göre tekilleştirilir. Bulunamayan nokta için en yakın doğrulanabilir OSM nesnesi kullanılır ve raporlanır.
8. `npm run dev` → `concurrently` ile Express (`node --watch`) + Vite (`/api` proxy).
9. `/admin`: `users.role = 'admin'` ile giriş (admin hesabı `.env`'den, sunucuda oluşturulur). Genel bakış, başvurular (onay/red),
   mekanlar (düzenle/sil), oylar/yorumlar (sil) yeni API ve oylama/ücret yapısıyla.

## Hedef dışı
- Diğer şehirler, e-posta doğrulama, şifre sıfırlama, kullanıcı yönetimi ekranı, sosyal giriş.
- Üretim dağıtımı (Express'in `dist` sunması vb.) — istenmedi.
- Eski IndexedDB verilerini taşımak (deneme verisiydi).

## Yaklaşımlar
| Yaklaşım | Artı | Eksi |
|---|---|---|
| **sql.js (seçildi)** | Saf WASM, her işletim sisteminde derlemesiz çalışır | Veritabanı bellekte, her yazmada dosyaya yazılır (bu ölçekte sorun değil) |
| sqlite + sqlite3 | Gerçek dosya tabanlı SQLite | Native modül; Windows'ta önceden derlenmiş ikili yoksa C++ derlemesi ister |
| node:sqlite | Bağımlılık yok | Deneysel; yalnızca yeni Node sürümlerinde var |

## Bekleyen başvuru
Ekleyen kullanıcının verdiği puan (temizlik, konfor, ücret) mekan onaylandığında ilk oy olarak `votes`'a yazılır.

## Uygulayıcıya bırakılanlar
Klasör yapısı, API yol adları, bileşen içi düzen; mevcut bileşenler mümkün olduğunca korunur (cerrahi değişiklik).
