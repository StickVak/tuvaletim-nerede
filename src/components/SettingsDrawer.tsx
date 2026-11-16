import { HeartHandshake, Info, Star, X } from 'lucide-react';
import Logo from './Logo';

interface Props {
  open: boolean;
  onClose: () => void;
  placeCount: number;
  myVoteCount: number;
}

export default function SettingsDrawer({ open, onClose, placeCount, myVoteCount }: Props) {
  if (!open) return null;
  return (
    <div className="absolute inset-0 z-50" role="dialog" aria-modal="true" aria-label="Ayarlar">
      <div className="absolute inset-0 animate-fade-in bg-ink/40 backdrop-blur-[2px]" onClick={onClose} />
      <aside className="absolute inset-y-0 left-0 flex w-[88%] max-w-[360px] animate-drawer-in flex-col bg-white shadow-2xl">
        <header className="flex items-center justify-between px-5 pb-4 pt-[max(1.25rem,env(safe-area-inset-top))]">
          <div className="flex items-center gap-3">
            <Logo size={40} />
            <div>
              <h2 className="text-lg font-extrabold leading-tight">Tuvaletim Nerede?</h2>
              <p className="text-xs font-medium text-ink-muted">Ayarlar</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Kapat" className="rounded-full bg-card p-2 hover:bg-gray-100">
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
              <Info size={13} /> Nasıl çalışır?
            </h3>
            <ul className="space-y-2 text-sm text-ink-soft">
              <li className="rounded-2xl bg-card p-3.5">
                <b className="text-ink">ACİL</b> butonu, yakınınızdaki ücretsiz ve puanı yüksek tuvaleti bulup rotayı çizer.
              </li>
              <li className="rounded-2xl bg-card p-3.5">
                Bir pine dokunarak mekanı <b className="text-ink">puanlayabilir</b> ve yorum bırakabilirsiniz.
              </li>
              <li className="rounded-2xl bg-card p-3.5">
                Sarı <b className="text-ink">+</b> butonuyla eklediğiniz mekanlar incelendikten sonra haritada yayınlanır.
              </li>
            </ul>
          </section>

          <p className="flex items-center justify-center gap-1.5 text-center text-[11px] text-ink-muted">
            <HeartHandshake size={13} /> v2.0 · Harita © OpenStreetMap katkıcıları
          </p>
        </div>
      </aside>
    </div>
  );
}
