import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../app.js';

export const SECRET = 'test-secret';

/** Geçici veritabanıyla uygulamayı rastgele portta başlatır. */
export async function startServer({ seed = [], limits = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'tn-test-'));
  const seedFile = join(dir, 'seed.json');
  writeFileSync(seedFile, JSON.stringify(seed));
  const app = await createApp({
    dbPath: join(dir, 'test.db'),
    secret: SECRET,
    seedFile,
    adminUsername: 'admin',
    adminPassword: 'admin123',
    limits,
  });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const url = `http://127.0.0.1:${server.address().port}`;

  async function req(method, path, body, token) {
    const res = await fetch(url + path, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  }

  async function register(username, password = 'secret1') {
    const r = await req('POST', '/api/auth/register', { username, password });
    return r.body.token;
  }

  async function registerFull(username, password = 'secret1') {
    const r = await req('POST', '/api/auth/register', { username, password });
    return { token: r.body.token, user: r.body.user };
  }

  async function adminToken() {
    const r = await req('POST', '/api/auth/login', { username: 'admin', password: 'admin123' });
    return r.body.token;
  }

  return {
    url,
    req,
    register,
    registerFull,
    adminToken,
    dir,
    close: () => {
      server.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
