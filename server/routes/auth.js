import { Router } from 'express';
import { hashPassword, publicUser, requireUser, signToken, verifyPassword } from '../auth.js';

const USERNAME_RE = /^[\p{L}\p{N}_.-]{3,30}$/u;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function authRoutes(db, secret) {
  const r = Router();
  const respond = (res, status, user) => res.status(status).json({ token: signToken({ id: user.id, role: user.role }, secret), user: publicUser(user) });

  r.post('/register', (req, res) => {
    const username = String(req.body?.username ?? '').trim();
    const email = String(req.body?.email ?? '').trim() || null;
    const password = String(req.body?.password ?? '');
    if (!USERNAME_RE.test(username)) return res.status(400).json({ error: 'Kullanıcı adı 3-30 karakter olmalı; harf, rakam, _ . - kullanılabilir.' });
    if (email && !EMAIL_RE.test(email)) return res.status(400).json({ error: 'Geçerli bir e-posta girin.' });
    if (password.length < 6) return res.status(400).json({ error: 'Şifre en az 6 karakter olmalı.' });
    if (db.get('SELECT 1 FROM users WHERE username = ?', [username])) return res.status(409).json({ error: 'Bu kullanıcı adı alınmış.' });
    if (email && db.get('SELECT 1 FROM users WHERE email = ?', [email])) return res.status(409).json({ error: 'Bu e-posta ile kayıtlı bir hesap var.' });

    const { lastId } = db.run('INSERT INTO users (username, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)', [
      username, email, hashPassword(password), 'user', new Date().toISOString(),
    ]);
    respond(res, 201, { id: lastId, username, role: 'user' });
  });

  r.post('/login', (req, res) => {
    const login = String(req.body?.username ?? '').trim();
    const user = db.get('SELECT * FROM users WHERE username = ? OR email = ?', [login, login]);
    if (!user || !verifyPassword(req.body?.password ?? '', user.password_hash)) {
      return res.status(401).json({ error: 'Kullanıcı adı veya şifre hatalı.' });
    }
    respond(res, 200, user);
  });

  r.get('/me', requireUser, (req, res) => res.json({ user: req.user }));
  return r;
}
