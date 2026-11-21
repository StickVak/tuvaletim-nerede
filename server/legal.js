/**
 * Hizmet Şartları ve Gizlilik Politikası sayfaları.
 *
 * Sunucuda düz HTML olarak üretilir (JavaScript gerektirmez): Google OAuth onay ekranı ve doğrulama ekibi bu adresleri
 * herkese açık, doğrudan okunabilir sayfalar olarak ister. Adresler:
 *   /gizlilik-politikasi  (/privacy → yönlendirme)
 *   /hizmet-sartlari      (/terms   → yönlendirme)
 *
 * İletişim adresi: CONTACT_EMAIL, yoksa MAIL_FROM'daki gönderen adresi.
 * Metin değiştiğinde LEGAL_VERSION güncellenir; kullanıcının kabul ettiği sürüm users.terms_version'da saklanır.
 */
import { Router } from 'express';
import { parseSender } from './mailer.js';

export const LEGAL_VERSION = '2026-11-20';
const UPDATED_TR = '20 Kasım 2026';
export const PRIVACY_PATH = '/gizlilik-politikasi';
export const TERMS_PATH = '/hizmet-sartlari';
const APP_NAME = 'Tuvaletim Nerede?';

/** Hukuki sayfalarda gösterilecek iletişim e-postası ya da null */
export function legalContact(env = process.env) {
  const direct = String(env.CONTACT_EMAIL ?? '').trim();
  if (direct) return parseSender(direct)?.email ?? null;
  return parseSender(env.MAIL_FROM)?.email ?? null;
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function contactHtml(email) {
  return email
    ? `<a href="mailto:${esc(email)}">${esc(email)}</a>`
    : 'uygulamanın yayıncısına bu sayfanın bulunduğu alan adı üzerinden';
}

function privacyBody(email) {
  const contact = contactHtml(email);
  return `
<p class="lead">Bu Gizlilik Politikası, ${APP_NAME} (“Uygulama”, “biz”) kullanılırken hangi kişisel verilerin işlendiğini,
neden işlendiğini, kimlerle paylaşıldığını ve haklarınızı açıklar. Metin, 6698 sayılı Kişisel Verilerin Korunması Kanunu
(“KVKK”) kapsamındaki aydınlatma yükümlülüğünü de karşılamak amacıyla hazırlanmıştır.</p>

<h2>1. Veri sorumlusu ve iletişim</h2>
<p>Kişisel verileriniz, Uygulamanın işletmecisi tarafından veri sorumlusu sıfatıyla işlenir. Bu politika ve verilerinizle
ilgili tüm sorularınız ile başvurularınız için: ${contact}.</p>

<h2>2. İşlediğimiz veriler</h2>
<h3>Hesap bilgileri</h3>
<ul>
  <li><b>E-posta ile kayıtta:</b> kullanıcı adı, e-posta adresi ve şifreniz. Şifreniz düz metin olarak değil, geri
  çevrilemeyen bir özet (scrypt) olarak saklanır. E-postanızı doğrulamak için gönderilen 6 haneli kod da yalnızca özet
  olarak ve en fazla 10 dakika tutulur.</li>
  <li><b>Google ile girişte:</b> Google hesabınızın benzersiz kimliği, adınız, e-posta adresiniz, e-postanın Google
  tarafından doğrulanıp doğrulanmadığı bilgisi ve profil fotoğrafınızın adresi. Yalnızca <code>openid</code>,
  <code>email</code> ve <code>profile</code> izinleri istenir; Google hesabınızdaki başka hiçbir veriye (Gmail, Drive,
  kişiler, takvim vb.) erişilmez.</li>
  <li><b>Profil:</b> isteğe bağlı olarak eklediğiniz görünen ad, kısa biyografi ve profil fotoğrafı.</li>
  <li>Hizmet şartlarını kabul ettiğiniz tarih ve kabul ettiğiniz metnin sürümü.</li>
</ul>
<h3>Katkılarınız</h3>
<ul>
  <li>Eklediğiniz mekanlar (ad, adres, haritadaki konumu, özellikleri) ve mekanın dış cephe/giriş fotoğrafı.</li>
  <li>Verdiğiniz puanlar, yorumlar, ücret bilgileri, “kapalı / malzeme yok / kalabalık” gibi durum bildirimleri ve
  favorileriniz.</li>
</ul>
<h3>Cihaz ve oturum bilgileri</h3>
<ul>
  <li>“Bu cihazı hatırla” ya da Google ile girişte oluşturulan güvenilir cihaz kaydı: cihaz/tarayıcı adı (ör. “iPhone ·
  Safari”), tarayıcının gönderdiği tanıtıcı bilgi (user-agent), oluşturulma, son kullanım ve bitiş tarihleri. Cihazı
  tanıyan anahtarın kendisi sunucuda değil, yalnızca özeti saklanır.</li>
  <li>Kötüye kullanımı (ör. art arda hatalı giriş denemeleri) sınırlamak için IP adresiniz kısa süreliğine sunucu
  belleğinde tutulur; veritabanına yazılmaz. Barındırma sağlayıcımızın sunucu kayıtlarında da IP adresi ve istek
  bilgileri sınırlı süre bulunabilir.</li>
</ul>
<h3>Konum</h3>
<p>Konum izni verirseniz konumunuz yalnızca cihazınızda, size yakın tuvaletleri göstermek ve mesafeyi hesaplamak için
kullanılır; sunucumuza gönderilmez ve saklanmaz. Yol tarifi istediğinizde başlangıç (konumunuz) ve varış noktasının
koordinatları rota hesaplamak için aşağıda belirtilen açık kaynak rota servisine gönderilir. Mekan eklerken seçtiğiniz
nokta, mekanın konumu olarak kaydedilir.</p>
<p>Uygulamada reklam, reklam kimliği, analiz/izleme aracı ya da üçüncü taraf izleme çerezi kullanılmaz.</p>

<h2>3. Verileri hangi amaçlarla ve hangi hukuki sebeplere dayanarak işliyoruz?</h2>
<ul>
  <li><b>Hesabınızı oluşturmak, giriş yapmanızı ve oturumunuzu sürdürmek; katkılarınızı yayınlamak:</b> hizmetin
  sunulması için sözleşmenin kurulması ve ifası (KVKK m. 5/2-c).</li>
  <li><b>Hesap güvenliği, sahte hesap ve kötüye kullanımın önlenmesi, içerik denetimi:</b> meşru menfaatimiz
  (KVKK m. 5/2-f).</li>
  <li><b>Yasal yükümlülüklerin yerine getirilmesi ve olası uyuşmazlıklarda hakların korunması:</b> KVKK m. 5/2-ç ve
  5/2-e.</li>
</ul>
<p>Verileriniz satılmaz, kiralanmaz, reklam ya da profil çıkarma amacıyla kullanılmaz.</p>

<h2>4. Google kullanıcı verileri</h2>
<p>${APP_NAME} uygulamasının Google API'lerinden aldığı bilgileri kullanması ve başka herhangi bir uygulamaya aktarması,
Sınırlı Kullanım (Limited Use) koşulları dahil olmak üzere
<a href="https://developers.google.com/terms/api-services-user-data-policy" rel="noopener">Google API Hizmetleri Kullanıcı
Verileri Politikası</a>'na uygundur. Google'dan alınan veriler yalnızca hesabınızı oluşturmak/tanımak ve profilinizde
adınızı ve fotoğrafınızı göstermek için kullanılır; reklam için kullanılmaz, üçüncü kişilere aktarılmaz ve yapay zekâ
modellerinin eğitiminde kullanılmaz. Erişimi dilediğiniz zaman
<a href="https://myaccount.google.com/permissions" rel="noopener">Google hesap izinleri</a> sayfasından
kaldırabilirsiniz.</p>

<h2>5. Herkese açık bilgiler</h2>
<p>Kullanıcı adınız, görünen adınız, profil fotoğrafınız, biyografiniz, eklediğiniz mekanlar ve fotoğrafları, puanlarınız
ve yorumlarınız Uygulamanın diğer kullanıcılarına açıktır. E-posta adresiniz, şifreniz ve cihaz bilgileriniz hiçbir
zaman herkese açık gösterilmez.</p>

<h2>6. Verilerin aktarıldığı hizmet sağlayıcılar</h2>
<p>Hizmeti sunabilmek için verileriniz, yalnızca gerekli olduğu ölçüde ve kendi adımıza işlemek üzere aşağıdaki
sağlayıcılara aktarılır:</p>
<ul>
  <li><b>Render</b> — uygulamanın barındırılması.</li>
  <li><b>Turso</b> — veritabanı.</li>
  <li><b>Cloudinary</b> — mekan ve profil fotoğraflarının saklanması.</li>
  <li><b>Brevo</b> (veya yapılandırılmışsa başka bir e-posta sağlayıcısı) — doğrulama kodu e-postalarının gönderilmesi.</li>
  <li><b>Google</b> — “Google ile Giriş Yap” seçeneğini kullanırsanız kimlik doğrulama.</li>
  <li><b>OpenStreetMap</b> harita sunucuları (tile.openstreetmap.org; ulaşılamazsa yedek olarak <b>Esri</b>, server.arcgisonline.com) — harita görüntülerinin yüklenmesi.</li>
  <li><b>routing.openstreetmap.de</b> ve <b>router.project-osrm.org</b> — yalnızca yol tarifi istediğinizde rota
  hesaplanması.</li>
  <li><b>Google Fonts</b> — yazı tipinin yüklenmesi.</li>
</ul>
<p>Harita, rota ve yazı tipi sunucuları içeriği doğrudan tarayıcınıza gönderdiği için IP adresinizi görebilir. Bu
sağlayıcıların sunucuları yurt dışında bulunabilir; bu nedenle verileriniz KVKK m. 9'da öngörülen şartlara uygun olarak
yurt dışına aktarılabilir. Yasal bir zorunluluk olması halinde veriler yetkili kamu kurum ve kuruluşlarıyla
paylaşılabilir.</p>

<h2>7. Çerezler ve cihazda saklanan veriler</h2>
<ul>
  <li><code>tn_device</code> — güvenilir cihaz çerezi (HttpOnly). Tekrar giriş yapmanıza gerek kalmaması içindir; son
  kullanımdan itibaren 90 gün geçerlidir. Çıkış yaptığınızda silinir.</li>
  <li><code>tn_oauth</code> — Google ile giriş sırasında güvenlik için kullanılan geçici çerez (en fazla 10 dakika).</li>
  <li>Tarayıcının yerel deposunda oturum anahtarı, tema tercihi ve yükleme önerisinin kapatılma zamanı gibi uygulama
  ayarları tutulur.</li>
</ul>
<p>Bu çerezler hizmetin çalışması için zorunludur; reklam veya izleme amaçlı çerez kullanılmaz.</p>

<h2>8. Saklama süreleri</h2>
<ul>
  <li>Hesap bilgileri ve katkılarınız, hesabınız silinene kadar saklanır.</li>
  <li>E-posta doğrulama kodları en fazla 10 dakika; güvenilir cihaz kayıtları süresi dolana ya da iptal edilene kadar
  (sonrasında düzenli olarak temizlenir).</li>
  <li>Hesabınız silindiğinde puanlarınız, yorumlarınız, favorileriniz, durum bildirimleriniz ve cihaz kayıtlarınız silinir.
  Eklediğiniz ve yayınlanmış mekanlar, haritanın bütünlüğü için sizinle ilişkisi kaldırılarak (anonimleştirilerek)
  haritada kalabilir.</li>
</ul>

<h2>9. Güvenlik</h2>
<p>Bağlantılar HTTPS ile şifrelenir; şifreler ve doğrulama kodları özet olarak saklanır; oturum çerezleri JavaScript ile
okunamaz (HttpOnly). Profil sayfanızdan oturum açık cihazlarınızı görebilir, tek tek ya da tümünden çıkış
yapabilirsiniz. Hiçbir sistem tamamen güvenli olmadığından şüpheli bir durum fark ederseniz lütfen bize bildirin.</p>

<h2>10. Haklarınız</h2>
<p>KVKK m. 11 uyarınca; verilerinizin işlenip işlenmediğini öğrenme, işlenmişse bilgi talep etme, işlenme amacını ve
amacına uygun kullanılıp kullanılmadığını öğrenme, aktarıldığı üçüncü kişileri bilme, eksik veya yanlış işlenmişse
düzeltilmesini, silinmesini veya yok edilmesini isteme, bu işlemlerin aktarıldığı üçüncü kişilere bildirilmesini isteme,
otomatik sistemlerle analiz edilmesi sonucu aleyhinize bir sonuç çıkmasına itiraz etme ve kanuna aykırı işleme nedeniyle
zarara uğramanız halinde zararın giderilmesini talep etme haklarına sahipsiniz.</p>
<p>Kullanıcı adınızı, görünen adınızı, biyografinizi ve profil fotoğrafınızı profil sayfanızdan kendiniz
değiştirebilirsiniz. <b>Hesabınızın ve verilerinizin silinmesi</b> dahil diğer talepleriniz için kayıtlı e-posta
adresinizden ${contact} adresine yazmanız yeterlidir; talebiniz en geç 30 gün içinde ücretsiz olarak sonuçlandırılır.
Başvurunuza yanıt alamamanız veya yanıtı yetersiz bulmanız halinde Kişisel Verileri Koruma Kurulu'na şikâyette
bulunabilirsiniz.</p>

<h2>11. Çocuklar</h2>
<p>Uygulamada hesap açmak için en az 13 yaşında olmanız gerekir. 13 yaşından küçük bir çocuğa ait veri işlendiğini fark
edersek bu verileri sileriz.</p>

<h2>12. Değişiklikler</h2>
<p>Bu politikayı güncelleyebiliriz. Güncel metin her zaman bu sayfada yayımlanır ve en üstteki “Son güncelleme” tarihi
değişir. Önemli değişiklikleri Uygulama üzerinden duyururuz.</p>`;
}

function termsBody(email) {
  const contact = contactHtml(email);
  return `
<p class="lead">Bu Hizmet Şartları, ${APP_NAME} (“Uygulama”, “biz”) web uygulamasını ve ona bağlı hizmetleri kullanımınızı
düzenler. Hesap oluşturarak ya da Google ile giriş yaparak bu şartları ve
<a href="${PRIVACY_PATH}">Gizlilik Politikası</a>'nı okuduğunuzu ve kabul ettiğinizi beyan edersiniz. Kabul etmiyorsanız
lütfen hesap oluşturmayın.</p>

<h2>1. Hizmetin tanımı</h2>
<p>Uygulama, kullanıcıların katkılarıyla oluşturulan bir halka açık tuvalet haritasıdır: yakındaki tuvaletleri bulmanızı,
yol tarifi almanızı, mekanları puanlamanızı, yorum yapmanızı, durum bildirmenizi ve yeni mekan önermenizi sağlar.
Haritayı görüntülemek için hesap gerekmez; katkı yapmak için hesap gerekir. Hizmet ücretsizdir.</p>

<h2>2. Hesabınız</h2>
<ul>
  <li>Hesap açmak için en az 13 yaşında olmalısınız.</li>
  <li>Kayıtta doğru bilgi vermeli, size ait bir e-posta adresi kullanmalı ve bilgilerinizi güncel tutmalısınız.</li>
  <li>Hesabınızın ve şifrenizin güvenliğinden siz sorumlusunuz. Ortak kullanılan cihazlarda “Bu cihazı hatırla”
  seçeneğini işaretlemeyin; yetkisiz bir kullanım fark ederseniz şifrenizi değiştirip tüm cihazlardan çıkış yapın ve
  bize bildirin.</li>
  <li>Başkasının adına, yanıltıcı biçimde ya da bir yasağı aşmak amacıyla hesap açamazsınız. Kullanıcı adları
  büyük/küçük harf farkı gözetilmeksizin benzersizdir.</li>
</ul>

<h2>3. Katkılarınız (kullanıcı içeriği)</h2>
<p>Eklediğiniz mekanlar, fotoğraflar, puanlar, yorumlar ve bildirimler sizin içeriğinizdir. İçeriği Uygulamada
paylaşarak bize; bu içeriği Uygulama içinde ve Uygulamanın tanıtımında barındırmak, çoğaltmak, görüntülemek,
biçimini teknik olarak uyarlamak (ör. boyutlandırma) ve diğer kullanıcılarla paylaşmak için dünya çapında, münhasır
olmayan, bedelsiz ve hizmet sürdüğü müddetçe geçerli bir lisans verirsiniz.</p>
<p>Paylaştığınız içeriğin:</p>
<ul>
  <li>doğru olduğundan ve kendi deneyiminize dayandığından,</li>
  <li>üzerinde gerekli haklara sahip olduğunuzdan,</li>
  <li>yürürlükteki mevzuata ve bu şartlara aykırı olmadığından</li>
</ul>
<p>siz sorumlusunuz.</p>
<p><b>Fotoğraflar</b> yalnızca mekanın dış cephesini veya girişini göstermelidir. Tuvaletlerin içinde fotoğraf çekmek,
tanınabilir kişilerin, plakaların ya da başkalarına ait kişisel bilgilerin yer aldığı fotoğraflar yüklemek kesinlikle
yasaktır.</p>

<h2>4. Yasak davranışlar</h2>
<ul>
  <li>Yanlış, yanıltıcı ya da var olmayan mekan, puan veya durum bildirimi göndermek; puanları manipüle etmek.</li>
  <li>Hakaret, nefret söylemi, taciz, tehdit, müstehcenlik, ayrımcılık veya kişilik haklarını ihlal eden içerik.</li>
  <li>Reklam, spam, zincir mesaj, başka bir hizmete yönlendirme.</li>
  <li>Başkalarının kişisel verilerini paylaşmak.</li>
  <li>Uygulamaya yetkisiz erişmeye çalışmak, güvenlik önlemlerini aşmak, otomatik araçlarla aşırı istek göndermek veya
  verileri toplu olarak çekmek, hizmetin işleyişini bozmak.</li>
  <li>Yürürlükteki mevzuata aykırı her türlü kullanım.</li>
</ul>

<h2>5. İçerik denetimi ve hesapların askıya alınması</h2>
<p>Önerilen yeni mekanlar yayınlanmadan önce incelenir. Bu şartlara aykırı olduğunu düşündüğümüz içeriği önceden haber
vermeksizin yayınlamayabilir, düzenleyebilir veya kaldırabilir; ihlal halinde hesabınızı geçici veya kalıcı olarak
askıya alabilir ya da silebiliriz. Uygunsuz bir içerik görürseniz ${contact} adresinden bize bildirebilirsiniz.</p>

<h2>6. Üçüncü taraf hizmetler</h2>
<p>Harita verileri ve görüntüleri © OpenStreetMap katkıcılarına aittir ve Open Database License (ODbL) kapsamındadır. Yol
tarifleri üçüncü taraf açık kaynak rota servislerince hesaplanır. Google ile giriş Google'ın kendi şartlarına tabidir.
Bu hizmetlerin içeriğinden ve kesintisiz çalışmasından sorumlu değiliz.</p>

<h2>7. Sorumluluğun reddi</h2>
<p>Uygulamadaki bilgiler büyük ölçüde kullanıcılar tarafından sağlanır ve <b>“olduğu gibi”</b> sunulur. Bir tuvaletin
var olduğunu, açık olduğunu, ücretsiz, temiz, erişilebilir veya kullanıma uygun olduğunu, çalışma saatlerinin ya da
gösterilen rotanın doğru ve güvenli olduğunu garanti etmeyiz. Yol tariflerini kullanırken trafik kurallarına ve
çevrenize dikkat edin. Hizmetin kesintisiz veya hatasız olacağını taahhüt etmeyiz; hizmeti önceden haber vermeksizin
değiştirebilir veya sonlandırabiliriz.</p>

<h2>8. Sorumluluğun sınırlandırılması</h2>
<p>Yürürlükteki mevzuatın izin verdiği azami ölçüde; Uygulamanın kullanımından veya kullanılamamasından, kullanıcı
içeriğinden ya da üçüncü taraf hizmetlerden doğan dolaylı zararlardan sorumlu değiliz. Kast ve ağır kusur hallerinde
ve tüketici mevzuatı kapsamındaki emredici haklarınız saklıdır.</p>

<h2>9. Hesabın sonlandırılması</h2>
<p>Dilediğiniz zaman Uygulamayı kullanmayı bırakabilir ve ${contact} adresine yazarak hesabınızın silinmesini
isteyebilirsiniz. Hesabınız silindiğinde hangi verilerin silindiği <a href="${PRIVACY_PATH}">Gizlilik Politikası</a>'nda
açıklanmıştır.</p>

<h2>10. Değişiklikler</h2>
<p>Bu şartları güncelleyebiliriz. Güncel metin her zaman bu sayfada yayımlanır ve en üstteki “Son güncelleme” tarihi
değişir. Önemli değişiklikleri Uygulama üzerinden duyururuz; değişiklikten sonra Uygulamayı kullanmaya devam etmeniz
güncel şartları kabul ettiğiniz anlamına gelir.</p>

<h2>11. Uygulanacak hukuk</h2>
<p>Bu şartlar Türkiye Cumhuriyeti kanunlarına tabidir. Uyuşmazlıklarda Türkiye Cumhuriyeti mahkemeleri ve icra daireleri
yetkilidir; tüketici sıfatıyla sahip olduğunuz tüketici hakem heyetlerine ve tüketici mahkemelerine başvurma hakkınız
saklıdır.</p>

<h2>12. İletişim</h2>
<p>Sorularınız için: ${contact}.</p>`;
}

function page({ title, path, body }) {
  const other = path === PRIVACY_PATH ? { href: TERMS_PATH, label: 'Hizmet Şartları' } : { href: PRIVACY_PATH, label: 'Gizlilik Politikası' };
  return `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light dark" />
<title>${title} · ${APP_NAME}</title>
<meta name="description" content="${APP_NAME} ${title}" />
<link rel="icon" type="image/png" href="/favicon.png" />
<style>
  :root { --bg:#f6f6f4; --surface:#fff; --ink:#1c1c1c; --soft:#4a4a4a; --muted:#767676; --line:#e5e5e2; --brand:#ffc300; --link:#8a6400; }
  @media (prefers-color-scheme: dark) {
    :root { --bg:#121212; --surface:#1e1e1e; --ink:#f2f2f2; --soft:#cfcfcf; --muted:#9a9a9a; --line:#2e2e2e; --link:#ffd24d; }
  }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--ink); font:16px/1.65 Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  header { position:sticky; top:0; background:var(--surface); border-bottom:1px solid var(--line); }
  .bar { max-width:760px; margin:0 auto; padding:12px 16px; display:flex; align-items:center; justify-content:space-between; gap:12px; }
  .bar a { color:var(--ink); text-decoration:none; font-weight:700; font-size:14px; }
  .back { display:inline-flex; align-items:center; gap:6px; background:var(--brand); color:#1c1c1c !important; padding:8px 14px; border-radius:999px; }
  main { max-width:760px; margin:0 auto; padding:28px 16px 48px; }
  article { background:var(--surface); border:1px solid var(--line); border-radius:24px; padding:28px 24px; }
  h1 { margin:0 0 4px; font-size:28px; line-height:1.25; }
  .updated { margin:0 0 20px; color:var(--muted); font-size:14px; }
  .lead { color:var(--soft); }
  h2 { margin:32px 0 8px; font-size:19px; }
  h3 { margin:18px 0 4px; font-size:16px; }
  p, li { color:var(--soft); }
  b { color:var(--ink); }
  ul { padding-left:20px; }
  li { margin:6px 0; }
  a { color:var(--link); }
  code { font-size:.9em; background:var(--bg); border:1px solid var(--line); border-radius:6px; padding:1px 5px; }
  footer { max-width:760px; margin:0 auto; padding:0 16px 40px; color:var(--muted); font-size:13px; text-align:center; }
  footer a { color:var(--muted); }
  @media (max-width:480px) { article { padding:22px 16px; border-radius:20px; } h1 { font-size:24px; } }
</style>
</head>
<body>
<header><div class="bar"><a class="back" href="/">← Uygulamaya dön</a><a href="${other.href}">${other.label}</a></div></header>
<main><article>
<h1>${title}</h1>
<p class="updated">Son güncelleme: ${UPDATED_TR}</p>
${body}
</article></main>
<footer><a href="${PRIVACY_PATH}">Gizlilik Politikası</a> · <a href="${TERMS_PATH}">Hizmet Şartları</a> · ${APP_NAME}</footer>
</body>
</html>`;
}

/** /gizlilik-politikasi ve /hizmet-sartlari sayfaları (+ /privacy, /terms kısa adresleri) */
export function legalRoutes({ contactEmail = null } = {}) {
  const r = Router();
  const privacy = page({ title: 'Gizlilik Politikası', path: PRIVACY_PATH, body: privacyBody(contactEmail) });
  const terms = page({ title: 'Hizmet Şartları', path: TERMS_PATH, body: termsBody(contactEmail) });
  const send = (html) => (_req, res) => {
    res.set({ 'Cache-Control': 'public, max-age=3600', 'X-Content-Type-Options': 'nosniff' });
    res.type('html').send(html);
  };
  r.get(PRIVACY_PATH, send(privacy));
  r.get(TERMS_PATH, send(terms));
  r.get(['/privacy', '/privacy-policy', '/gizlilik'], (_req, res) => res.redirect(301, PRIVACY_PATH));
  r.get(['/terms', '/terms-of-service', '/kosullar'], (_req, res) => res.redirect(301, TERMS_PATH));
  return r;
}
