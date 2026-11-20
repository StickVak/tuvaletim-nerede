import { FileText, HeartHandshake, Info, Monitor, Moon, Palette, ShieldCheck, Star, Sun, X } from 'lucide-react';
import { PRIVACY_URL, TERMS_URL } from '../lib/legal';
import type { ThemeSetting } from '../hooks/useTheme';
import Logo from './Logo';

interface Props {
  open: boolean;
  onClose: () => void;
  placeCount: number;
  myVoteCount: number;
  theme: ThemeSetting;
  onThemeChange: (t: ThemeSetting) => void;
}

const THEMES: { value: ThemeSetting; label: string; icon: typeof Sun }[] = [
  { value: 'system', label: 'Sistem', icon: Monitor },
  { value: 'light', label: 'Açık', icon: Sun },
  { value: 'dark', label: 'Koyu', icon: Moon },
];

export default function SettingsDrawer({ open, onClose, placeCount, myVoteCount, theme, onThemeChange }: Props) {
  if (!open) return null;
  return (
    <div className="absolute inset-0 z-50" role="dialog" aria-modal="true" aria-label="Ayarlar">
      <div className="absolute inset-0 animate-fade-in bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <aside className="absolute inset-y-0 left-0 flex w-[88%] max-w-[360px] animate-drawer-in flex-col bg-surface text-ink shadow-2xl">
        <header className="flex items-center justify-between px-5 pb-4 pt-[max(1.25rem,env(safe-area-inset-top))]">
          <div className="flex items-center gap-3">
            <Logo size={40} />
            <div>
              <h2 className="text-lg font-extrabold leading-tight">Tuvaletim Nerede?</h2>
              <p className="text-xs font-medium text-ink-muted">Ayarlar</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Kapat" className="rounded-full bg-card p-2 hover:bg-line/60">
            <X size={18} />
          </button>
        </header>

        <div className="no-scrollbar flex-1 space-y-6 overflow-y-auto px-5 pb-8">
          <section className="grid grid-cols-2 gap-2">
            <div className="rounded-2xl bg-brand-soft p-3">
              <div className="text-2xl font-extrabold">{placeCount}</div>
              <div className="text-[11px] font-semibold text-ink-soft">Kayıtlı tuvalet</div>
            </div>
            <div className="rounded-2xl bg-card p-3">
              <div className="flex items-center gap-1 text-2xl font-extrabold">
                {myVoteCount} <Star size={16} className="text-brand-dark" fill="currentColor" />
              </div>
              <div className="text-[11px] font-semibold text-ink-soft">Oy verdiğiniz mekan</div>
            </div>
          </section>

          <section>
            <h3 className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-ink-muted">
              <Palette size={13} /> Görünüm
            </h3>
            <div className="grid grid-cols-3 gap-1 rounded-2xl bg-card p-1" role="radiogroup" aria-label="Tema">
              {THEMES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  role="radio"
                  aria-checked={theme === t.value}
                  onClick={() => onThemeChange(t.value)}
                  className={`flex flex-col items-center gap-1 rounded-xl py-2.5 text-xs font-bold transition ${
                    theme === t.value ? 'bg-surface text-ink shadow-sm' : 'text-ink-muted hover:text-ink'
                  }`}
                >
                  <t.icon size={17} /> {t.label}
                </button>
              ))}
            </div>
          </section>

          <section>
            <h3 className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-ink-muted">
              <Info size={13} /> Nasıl çalışır?
            </h3>
            <ul className="space-y-2 text-sm text-ink-soft">
              <li className="rounded-2xl bg-card p-3.5">
                <b className="text-ink">Acil</b> butonu, 2 km içindeki ücretsiz tuvaletlerden en yakın ve (oylanmışsa) en iyi puanlıyı bulup rotayı çizer; yoksa en yakın tuvaleti gösterir.
              </li>
              <li className="rounded-2xl bg-card p-3.5">
                Bir pine dokunarak mekanı <b className="text-ink">puanlayabilir</b> ve yorum bırakabilirsiniz.
              </li>
              <li className="rounded-2xl bg-card p-3.5">
                Sarı <b className="text-ink">+</b> butonuyla eklediğiniz mekanlar incelendikten sonra haritada yayınlanır.
              </li>
            </ul>
          </section>

          <section>
            <h3 className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-ink-muted">
              <ShieldCheck size={13} /> Yasal
            </h3>
            <div className="overflow-hidden rounded-2xl bg-card">
              {[
                { href: TERMS_URL, label: 'Hizmet Şartları', icon: FileText },
                { href: PRIVACY_URL, label: 'Gizlilik Politikası', icon: ShieldCheck },
              ].map((l, i) => (
                <a
                  key={l.href}
                  href={l.href}
                  target="_blank"
                  rel="noopener"
                  className={`flex items-center gap-3 px-3.5 py-3 text-sm font-semibold text-ink hover:bg-line/40 ${i ? 'border-t border-line' : ''}`}
                >
                  <l.icon size={16} className="text-ink-muted" /> {l.label}
                </a>
              ))}
            </div>
          </section>

          <p className="flex items-center justify-center gap-1.5 text-center text-[11px] text-ink-muted">
            <HeartHandshake size={13} /> v2.0 · Harita © OpenStreetMap katkıcıları
          </p>
        </div>
      </aside>
    </div>
  );
}
