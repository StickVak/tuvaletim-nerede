import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Camera, Clock3, Heart, KeyRound, Loader2, LogOut, MapPinPlus, MessageSquareText, MonitorSmartphone, ShieldCheck, Star, Trash2, UserRound } from 'lucide-react';
import type { MyProfile } from '../types';
import { ApiError, api } from '../api';
import { useAuth } from '../hooks/useAuth';
import { readImageAsDataUrl } from '../lib/image';
import { joinedLabel, relTime } from '../lib/time';
import Avatar from './Avatar';
import ModalShell from './ModalShell';

const input = 'w-full rounded-2xl border-2 border-transparent bg-card px-4 py-2.5 text-sm font-medium text-ink outline-none focus:border-brand-dark';
/** GET /api/auth/devices */
interface TrustedDevice {
  id: number;
  label: string;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  /** false: "Bu cihazı hatırla" kapalıydı — tarayıcı kapanınca biter */
  remembered?: boolean;
  current: boolean;
}

const REPORT_TEXT = { closed: 'kapalı bildirdiniz', no_supplies: 'kağıt/sabun yok bildirdiniz', crowded: 'çok kalabalık bildirdiniz', open: 'açık / sorun yok bildirdiniz' } as const;

interface Props {
  onClose: () => void;
  onOpenPlace: (id: string) => void;
  onOpenPublic: (userId: number) => void;
  onToast: (text: string, tone?: 'success' | 'info' | 'error') => void;
}

/** Kendi profilim: istatistikler, ad/biyografi, şifre, fotoğraf, etkinlik geçmişi */
export default function ProfileModal({ onClose, onOpenPlace, onOpenPublic, onToast }: Props) {
  const { updateUser, logout, logoutAll } = useAuth();
  const [devices, setDevices] = useState<TrustedDevice[] | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const [p, setP] = useState<MyProfile | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [usernameError, setUsernameError] = useState('');
  const [bio, setBio] = useState('');
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const data = await api<MyProfile>('/profile');
    setP(data);
    setDisplayName(data.user.displayName);
    setUsername(data.user.username);
    setBio(data.user.bio);
  }, []);
  const loadDevices = useCallback(async () => setDevices(await api<TrustedDevice[]>('/auth/devices')), []);
  useEffect(() => {
    load().catch((e) => onToast((e as Error).message, 'error'));
    loadDevices().catch(() => setDevices([]));
  }, [load, loadDevices, onToast]);

  const revokeDevice = (d: TrustedDevice) =>
    run(`device-${d.id}`, async () => {
      await api(`/auth/devices/${d.id}`, { method: 'DELETE' });
      await loadDevices();
    }, `${d.label} artık güvenilir değil.`);
  const signOutEverywhere = async () => {
    setBusy('all');
    try {
      await logoutAll();
      onToast('Tüm cihazlardan çıkış yapıldı.', 'success');
      onClose();
    } catch (e) {
      onToast((e as Error).message, 'error');
      setBusy(null);
    }
  };

  const run = async (key: string, fn: () => Promise<void>, ok: string) => {
    setBusy(key);
    try {
      await fn();
      onToast(ok, 'success');
    } catch (e) {
      onToast((e as Error).message, 'error');
    } finally {
      setBusy(null);
    }
  };
  const applyUser = async (r: { user: MyProfile['user'] }) => {
    updateUser(r.user);
    await load();
  };

  const saveProfile = async () => {
    setUsernameError('');
    setBusy('profile');
    try {
      const changed = p && username.trim() !== p.user.username;
      await applyUser(await api('/profile', { method: 'PATCH', body: { displayName, bio, ...(changed ? { username: username.trim() } : {}) } }));
      onToast('Profiliniz güncellendi.', 'success');
    } catch (e) {
      // 409 "Bu kullanıcı adı daha önce alınmış…" / 400 biçim hatası: alanın altında göster
      if (e instanceof ApiError && e.field === 'username') setUsernameError(e.message);
      else onToast((e as Error).message, 'error');
    } finally {
      setBusy(null);
    }
  };
  const changePassword = () =>
    run('password', async () => {
      await api('/profile/password', { method: 'POST', body: { currentPassword: currentPw, newPassword: newPw } });
      setCurrentPw('');
      setNewPw('');
    }, 'Şifreniz değiştirildi.');
  const uploadAvatar = (file?: File) => {
    if (!file) return;
    void run('avatar', async () => {
      const image = await readImageAsDataUrl(file, 512, 0.85);
      await applyUser(await api('/profile/avatar', { method: 'PUT', body: { image } }));
    }, 'Profil fotoğrafınız güncellendi.');
  };
  const removeAvatar = () => run('avatar', async () => applyUser(await api('/profile/avatar', { method: 'DELETE' })), 'Profil fotoğrafı kaldırıldı.');

  return (
    <ModalShell label="Profilim" onClose={onClose}>
      {!p ? (
        <div className="flex h-60 items-center justify-center text-ink-muted"><Loader2 className="animate-spin" /></div>
      ) : (
        <div className="p-6">
          <div className="flex items-center gap-4">
            <div className="relative">
              <Avatar name={p.user.displayName} url={p.user.avatarUrl} size={80} />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                aria-label="Profil fotoğrafını değiştir"
                className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full bg-night text-white ring-2 ring-surface"
              >
                {busy === 'avatar' ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={(e) => {
                  uploadAvatar(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-xl font-extrabold">{p.user.displayName}</h2>
              <p className="text-sm text-ink-muted">@{p.user.username} · {joinedLabel(p.user.createdAt)}</p>
              <div className="mt-1 flex gap-3 text-xs font-bold">
                <button type="button" onClick={() => onOpenPublic(p.user.id)} className="text-ink-soft hover:text-ink">Herkese açık profilim</button>
                {p.user.avatarUrl && (
                  <button type="button" onClick={removeAvatar} className="flex items-center gap-1 text-red-600">
                    <Trash2 size={12} /> Fotoğrafı kaldır
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-4 gap-2 text-center" data-testid="profile-stats">
            {[
              { n: p.stats.votes, l: 'Oy', i: Star },
              { n: p.stats.comments, l: 'Yorum', i: MessageSquareText },
              { n: p.stats.placesAdded, l: 'Eklenen', i: MapPinPlus },
              { n: p.stats.favorites, l: 'Favori', i: Heart },
            ].map((s) => (
              <div key={s.l} className="rounded-2xl bg-card px-1 py-3">
                <s.i size={15} className="mx-auto text-brand-dark" />
                <div className="mt-1 text-lg font-extrabold">{s.n}</div>
                <div className="text-[10px] font-semibold text-ink-muted">{s.l}</div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-center text-xs font-semibold text-ink-soft" data-testid="contributions">Toplam katkı: {p.stats.contributions} 💧</p>
          {p.stats.pending > 0 && <p className="mt-1 text-center text-xs text-ink-muted">{p.stats.pending} eklemeniz incelemede.</p>}

          <section className="mt-6 space-y-2">
            <h3 className="flex items-center gap-2 text-sm font-extrabold"><UserRound size={15} /> Profil bilgileri</h3>
            <label className="block">
              <span className="mb-1 block text-xs font-bold text-ink-soft">Kullanıcı adı</span>
              <span className={`flex items-center rounded-2xl border-2 bg-card pl-4 focus-within:border-brand-dark ${usernameError ? 'border-red-500' : 'border-transparent'}`}>
                <span className="text-sm font-bold text-ink-muted">@</span>
                <input
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    setUsernameError('');
                  }}
                  maxLength={30}
                  aria-label="Kullanıcı adı"
                  aria-invalid={Boolean(usernameError)}
                  aria-describedby={usernameError ? 'profile-username-error' : undefined}
                  autoComplete="username"
                  className="w-full bg-transparent px-1 py-2.5 text-sm font-medium text-ink outline-none"
                />
              </span>
              {usernameError && <span id="profile-username-error" role="alert" className="mt-1 block text-xs font-semibold text-red-600">{usernameError}</span>}
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-bold text-ink-soft">Görünen ad</span>
              <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={40} className={input} />
            </label>
            <label className="block">
              <span className="mb-1 flex justify-between text-xs font-bold text-ink-soft">
                Biyografi <span className="font-medium text-ink-muted">{bio.length}/160</span>
              </span>
              <textarea value={bio} onChange={(e) => setBio(e.target.value)} maxLength={160} rows={2} className={`${input} resize-none`} placeholder="Kendinizden kısaca bahsedin" />
            </label>
            <button type="button" onClick={saveProfile} disabled={busy === 'profile'} className="w-full rounded-2xl bg-brand py-3 text-sm font-extrabold text-onbrand disabled:opacity-60">
              Kaydet
            </button>
          </section>

          <section className="mt-6 space-y-2">
            <h3 className="flex items-center gap-2 text-sm font-extrabold"><KeyRound size={15} /> Şifre değiştir</h3>
            <input type="password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} placeholder="Mevcut şifre" aria-label="Mevcut şifre" autoComplete="current-password" className={input} />
            <input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="Yeni şifre (en az 6 karakter)" aria-label="Yeni şifre" autoComplete="new-password" className={input} />
            <button type="button" onClick={changePassword} disabled={!currentPw || !newPw || busy === 'password'} className="w-full rounded-2xl bg-card py-3 text-sm font-bold text-ink ring-1 ring-line disabled:opacity-50">
              Şifreyi değiştir
            </button>
          </section>

          <section className="mt-6">
            <h3 className="flex items-center gap-2 text-sm font-extrabold"><Clock3 size={15} /> Etkinliklerim</h3>
            {p.activity.length === 0 ? (
              <p className="mt-2 text-sm text-ink-muted">Henüz bir etkinliğiniz yok. Bir tuvaleti puanlayarak başlayın!</p>
            ) : (
              <ul className="mt-2 divide-y divide-line">
                {p.activity.map((a, i) => (
                  <li key={i}>
                    <button type="button" onClick={() => a.kind !== 'pending' && onOpenPlace(a.placeId)} className="flex w-full items-start gap-3 py-2.5 text-left">
                      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-card">
                        {a.kind === 'vote' ? <Star size={13} /> : a.kind === 'favorite' ? <Heart size={13} /> : a.kind === 'report' ? <AlertTriangle size={13} /> : <MapPinPlus size={13} />}
                      </span>
                      <span className="min-w-0 flex-1 text-sm">
                        <b>{a.placeName}</b>{' '}
                        <span className="text-ink-soft">
                          {a.kind === 'vote' && `· ${a.cleanliness}/${a.comfort} puan verdiniz`}
                          {a.kind === 'favorite' && '· favorilere eklediniz'}
                          {a.kind === 'report' && a.reportType && `· ${REPORT_TEXT[a.reportType]}`}
                          {a.kind === 'place' && '· eklediğiniz tuvalet yayında'}
                          {a.kind === 'pending' && '· eklediğiniz tuvalet incelemede'}
                        </span>
                        {a.comment && <span className="mt-0.5 block truncate text-xs text-ink-muted">“{a.comment}”</span>}
                      </span>
                      <span className="shrink-0 text-[11px] text-ink-muted">{relTime(a.at)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="mt-6" aria-label="Güvenilir cihazlar">
            <h3 className="flex items-center gap-2 text-sm font-extrabold"><ShieldCheck size={15} /> Güvenilir cihazlar</h3>
            <p className="mt-1 text-xs text-ink-muted">Bu cihazlarda tekrar giriş yapmanız gerekmez. Tanımadığınız bir cihazı kaldırın.</p>
            {devices === null ? (
              <Loader2 size={18} className="mx-auto mt-3 animate-spin text-ink-muted" />
            ) : devices.length === 0 ? (
              <p className="mt-2 text-sm text-ink-muted">Güvenilir cihaz yok.</p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {devices.map((d) => (
                  <li key={d.id} className="flex items-center gap-3 rounded-2xl bg-card px-3 py-2.5">
                    <MonitorSmartphone size={18} className="shrink-0 text-ink-soft" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 text-sm font-bold">
                        <span className="truncate">{d.label}</span>
                        {d.current && <span className="shrink-0 rounded-full bg-brand px-2 py-0.5 text-[10px] font-extrabold text-onbrand">Bu cihaz</span>}
                      </span>
                      <span className="block text-[11px] text-ink-muted">
                        Son kullanım {relTime(d.lastUsedAt)}
                        {d.remembered === false && ' · tarayıcı kapanınca biter'}
                      </span>
                    </span>
                    {!d.current && (
                      <button type="button" onClick={() => void revokeDevice(d)} disabled={busy === `device-${d.id}`} aria-label={`${d.label} cihazını kaldır`}
                        className="rounded-xl p-2 text-ink-muted hover:bg-red-500/10 hover:text-red-600 disabled:opacity-50">
                        <Trash2 size={16} />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <button type="button" onClick={() => { void logout(); onClose(); }} className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-card py-3 text-sm font-bold text-ink">
            <LogOut size={15} /> Bu cihazdan çıkış yap
          </button>
          {confirmAll ? (
            <div className="mt-2 rounded-2xl bg-red-500/10 p-3" role="alertdialog" aria-label="Tüm cihazlardan çıkış onayı">
              <p className="text-sm font-semibold text-red-700 dark:text-red-400">Bu cihaz dahil tüm cihazlardaki oturumlarınız kapatılacak.</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setConfirmAll(false)} className="rounded-xl bg-surface py-2.5 text-sm font-bold text-ink">Vazgeç</button>
                <button type="button" onClick={() => void signOutEverywhere()} disabled={busy === 'all'} className="flex items-center justify-center gap-1.5 rounded-xl bg-red-600 py-2.5 text-sm font-bold text-white disabled:opacity-60">
                  {busy === 'all' && <Loader2 size={14} className="animate-spin" />} Evet, çıkış yap
                </button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmAll(true)} className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl py-2.5 text-sm font-bold text-red-600 hover:bg-red-500/10">
              <LogOut size={15} /> Tüm cihazlardan çıkış yap
            </button>
          )}
        </div>
      )}
    </ModalShell>
  );
}
