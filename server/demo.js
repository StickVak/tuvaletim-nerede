import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashPassword } from './auth.js';

/**
 * Örnek (demo) kullanıcılar ve oyları. Kurgusal kişilerdir; arayüzde "Örnek profil" olarak işaretlenir.
 * Şifreleri bilinmeyen rastgele bir değerdir, bu hesaplarla giriş yapılamaz.
 */
const USERS = [
  { username: 'ayse.karsiyaka', displayName: 'Ayşe Yılmaz', bio: "Karşıyaka'da yaşıyorum, sahilde koşmayı severim. Temiz tuvalet avcısıyım." },
  { username: 'mert.bornova', displayName: 'Mert Demir', bio: 'Ege Üni. öğrencisi; Forum ile kampüs arasında mekik dokuyorum.' },
  { username: 'zeynep.alsancak', displayName: 'Zeynep Kaya', bio: "Alsancak'ta grafik tasarımcı. Kahve + temiz lavabo = mutlu gün." },
  { username: 'emre.buca', displayName: 'Emre Şahin', bio: 'Buca’dan iki çocuk babası. Bebek bakım odası olan yerleri not ediyorum.' },
  { username: 'elif.konak', displayName: 'Elif Arslan', bio: "Kemeraltı esnafı kızı; Konak'ın her köşesini bilirim." },
  { username: 'can.gaziemir', displayName: 'Can Öztürk', bio: 'Havalimanında çalışıyorum, Gaziemir–Konak arası her gün yoldayım.' },
];

// [kullanıcı, mekan, temizlik, konfor, ücretli?, tutar, yorum, kaç gün önce, tuvalet tipi]
const VOTES = [
  ['can.gaziemir', 'seed-optimum-avm', 5, 4, false, null, 'Alt kattaki tuvaletler her saat temizleniyor, hiç sıra yok.', 3, 'alafranga'],
  ['ayse.karsiyaka', 'seed-optimum-avm', 4, 4, false, null, 'Hafta sonu kalabalık ama temiz. Bebek odası da var.', 11, 'alafranga'],
  ['mert.bornova', 'seed-forum-bornova', 4, 4, false, null, 'Sinema katındaki tuvalet daha sakin, oraya gidin.', 2, 'alafranga'],
  ['emre.buca', 'seed-forum-bornova', 5, 5, false, null, 'Bebek bakım ünitesi tertemizdi, sabun ve havlu eksiksiz.', 8, 'alafranga'],
  ['elif.konak', 'seed-forum-bornova', 3, 4, false, null, 'Akşam saatlerinde kağıt bitebiliyor.', 20, 'ikisi'],
  ['emre.buca', 'seed-wc-buca-hasanaga', 3, 2, true, 5, 'Parkta oynayan çocuklar için şart ama biraz bakımsız.', 4, 'alaturka'],
  ['ayse.karsiyaka', 'seed-wc-buca-hasanaga', 3, 3, true, 5, 'Görevli var, 5 lira alıyorlar. Sabun vardı.', 15, 'ikisi'],
  ['zeynep.alsancak', 'seed-starbucks-kibris-sehitleri', 4, 4, false, null, 'Şifre fişin altında yazıyor, kahve almadan girmek zor.', 1, 'alafranga'],
  ['mert.bornova', 'seed-starbucks-kibris-sehitleri', 3, 3, false, null, 'Tek kabin var, öğlen sıra oluyor.', 9, 'alafranga'],
  ['elif.konak', 'seed-konak-pier', 5, 5, false, null, 'Deniz manzaralı alışveriş merkezinde tuvaletler de çok bakımlı.', 6, 'alafranga'],
  ['can.gaziemir', 'seed-konak-pier', 4, 5, false, null, 'Vapura binmeden önce uğradım, temiz ve ferah.', 13, 'alafranga'],
  ['zeynep.alsancak', 'seed-istinyepark-izmir', 5, 5, false, null, 'İzmir’deki en iyisi olabilir; kokulu ve tertemiz.', 5, 'alafranga'],
  ['ayse.karsiyaka', 'seed-istinyepark-izmir', 5, 4, false, null, 'Otopark katındakiler daha boş.', 18, 'alafranga'],
  ['mert.bornova', 'seed-starbucks-bornova-kucukpark', 3, 3, true, 20, 'Müşteri değilseniz kullandırmıyorlar, en ucuz içecek ~20 TL.', 7, 'alafranga'],
  ['elif.konak', 'seed-wc-kulturpark', 2, 2, true, 5, 'Fuar zamanı çok kalabalık, kapıda kuyruk vardı.', 2, 'alaturka'],
  ['zeynep.alsancak', 'seed-wc-kulturpark', 3, 2, true, 10, 'Lozan kapısı tarafındaki daha temiz.', 12, 'ikisi'],
  ['can.gaziemir', 'seed-wc-alsancak-gundogdu', 3, 3, true, 10, 'Kordonda yürürken tek seçenek; görevli ilgili.', 4, 'ikisi'],
  ['ayse.karsiyaka', 'seed-wc-alsancak-gundogdu', 4, 3, true, 10, 'Sabah erken gittim, yeni temizlenmişti.', 9, 'ikisi'],
];

const AVATAR_SRC = fileURLToPath(new URL('./seed-avatars/', import.meta.url));

/** Örnek kullanıcıları ve oylarını ekler. Zaten varsa hiçbir şey yapmaz (true: eklendi). */
export function seedDemo(db, avatarDir) {
  if (db.get('SELECT 1 FROM users WHERE is_demo = 1')) return false;
  const day = 86400000;
  const now = Date.now();
  db.tx(() => {
    const ids = {};
    USERS.forEach((u, i) => {
      // Kullanıcı adı gerçek bir kullanıcıya aitse o örnek profil (ve oyları) atlanır
      if (db.get('SELECT 1 FROM users WHERE username = ?', [u.username])) return;
      const created = new Date(now - (60 + i * 7) * day).toISOString();
      const { lastId } = db.run(
        'INSERT INTO users (username, display_name, bio, password_hash, role, is_demo, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)',
        [u.username, u.displayName, u.bio, hashPassword(randomBytes(32).toString('hex')), 'user', created],
      );
      ids[u.username] = lastId;
      const src = join(AVATAR_SRC, `${u.username}.png`);
      if (existsSync(src)) {
        mkdirSync(avatarDir, { recursive: true });
        const file = `${lastId}-5eed${String(lastId).padStart(4, '0')}.png`;
        copyFileSync(src, join(avatarDir, file));
        db.run('UPDATE users SET avatar_url = ? WHERE id = ?', [`/api/avatars/${file}`, lastId]);
      }
    });
    for (const [user, place, c, k, paid, price, comment, daysAgo, type] of VOTES) {
      if (!ids[user] || !db.get('SELECT 1 FROM places WHERE id = ?', [place])) continue;
      const at = new Date(now - daysAgo * day).toISOString();
      db.run(
        `INSERT INTO votes (place_id, user_id, cleanliness, comfort, is_paid, price_amount, comment, toilet_type, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [place, ids[user], c, k, paid, price, comment, type, at, at],
      );
    }
  });
  return true;
}
