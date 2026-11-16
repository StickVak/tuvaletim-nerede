import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Camera, Clock3, Heart, KeyRound, Loader2, LogOut, MapPinPlus, MessageSquareText, Star, Trash2, UserRound } from 'lucide-react';
import type { MyProfile } from '../types';
import { api } from '../api';
import { useAuth } from '../hooks/useAuth';
import { readImageAsDataUrl } from '../lib/image';
import { joinedLabel, relTime } from '../lib/time';
import Avatar from './Avatar';
import ModalShell from './ModalShell';

const input = 'w-full rounded-2xl border-2 border-transparent bg-card px-4 py-2.5 text-sm font-medium text-ink outline-none focus:border-brand-dark';
const REPORT_TEXT = { closed: 'kapalı bildirdiniz', no_supplies: 'kağıt/sabun yok bildirdiniz', crowded: 'çok kalabalık bildirdiniz', open: 'açık / sorun yok bildirdiniz' } as const;

interface Props {
  onClose: () => void;
  onOpenPlace: (id: string) => void;
  onOpenPublic: (userId: number) => void;
  onToast: (text: string, tone?: 'success' | 'info' | 'error') => void;
}

/** Kendi profilim: istatistikler, ad/biyografi, şifre, fotoğraf, etkinlik geçmişi */
export default function ProfileModal({ onClose, onOpenPlace, onOpenPublic, onToast }: Props) {
  const { updateUser, logout } = useAuth();
  const [p, setP] = useState<MyProfile | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const data = await api<MyProfile>('/profile');
    setP(data);
    setDisplayName(data.user.displayName);
    setBio(data.user.bio);
  }, []);
  useEffect(() => {
    load().catch((e) => onToast((e as Error).message, 'error'));
  }, [load, onToast]);

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

  const saveProfile = () =>
    run('profile', async () => applyUser(await api('/profile', { method: 'PATCH', body: { displayName, bio } })), 'Profiliniz güncellendi.');
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
          {p.stats.pending > 0 && <p className="mt-2 text-center text-xs text-ink-muted">{p.stats.pending} eklemeniz incelemede.</p>}

          <section className="mt-6 space-y-2">
            <h3 className="flex items-center gap-2 text-sm font-extrabold"><UserRound size={15} /> Profil bilgileri</h3>
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

          <button type="button" onClick={() => { logout(); onClose(); }} className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-card py-3 text-sm font-bold text-ink">
            <LogOut size={15} /> Çıkış Yap
          </button>
        </div>
      )}
    </ModalShell>
  );
}
