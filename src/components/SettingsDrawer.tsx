import { useState } from 'react';
import { Check, ChevronRight, Clock3, Inbox, Map, MapPin, RotateCcw, ShieldCheck, Trash2, X } from 'lucide-react';
import type { MapStyle, Settings, Toilet } from '../types';
import { CATEGORIES } from '../lib/categories';
import StarRating from './StarRating';
import { PriceBadge } from './Badges';
import Logo from './Logo';

interface Props {
  open: boolean;
  onClose: () => void;
  settings: Settings;
  onSettingsChange: (s: Settings) => void;
  pending: Toilet[];
  approvedCount: number;
  locationLabel: string;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onResetData: () => void;
}

const MAP_STYLES: { value: MapStyle; label: string; hint: string }[] = [
  { value: 'voyager', label: 'Modern', hint: 'Google Maps benzeri' },
  { value: 'positron', label: 'Sade', hint: 'Açık gri, minimal' },
  { value: 'osm', label: 'Standart', hint: 'OpenStreetMap' },
];

function timeAgo(iso: string) {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const m = Math.round(diff / 60000);
  if (m < 1) return 'az önce';
  if (m < 60) return `${m} dk önce`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} sa önce`;
  return `${Math.round(h / 24)} gün önce`;
}

export default function SettingsDrawer({
  open,
  onClose,
  settings,
  onSettingsChange,
  pending,
  approvedCount,
  locationLabel,
  onApprove,
  onReject,
  onResetData,
}: Props) {
  const [confirmReset, setConfirmReset] = useState(false);
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
              <p className="text-xs font-medium text-ink-muted">Ayarlar & Yönetim</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Kapat" className="rounded-full bg-card p-2 hover:bg-gray-100">
            <X size={18} />
          </button>
        </header>

        <div className="no-scrollbar flex-1 space-y-6 overflow-y-auto px-5 pb-8">
          {/* Harita stili */}
          <section>
            <h3 className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-ink-muted">
              <Map size={13} /> Harita Görünümü
            </h3>
            <div className="grid grid-cols-3 gap-2">
              {MAP_STYLES.map((s) => {
                const active = settings.mapStyle === s.value;
                return (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => onSettingsChange({ ...settings, mapStyle: s.value })}
                    className={`rounded-2xl border-2 p-2.5 text-left transition ${
                      active ? 'border-brand-dark bg-brand-soft' : 'border-transparent bg-card hover:bg-gray-100'
                    }`}
                  >
                    <div className="flex items-center justify-between text-sm font-bold">
                      {s.label} {active && <Check size={14} />}
                    </div>
                    <div className="mt-0.5 text-[10px] leading-tight text-ink-muted">{s.hint}</div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Konum */}
          <section>
            <h3 className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-ink-muted">
              <MapPin size={13} /> Konum
            </h3>
            <label className="flex cursor-pointer items-center gap-3 rounded-2xl bg-card p-3.5">
              <div className="flex-1">
                <div className="text-sm font-bold">Demo konumu kullan</div>
                <div className="text-xs text-ink-muted">Örnek veriler Kadıköy'de. Şu an: {locationLabel}</div>
              </div>
              <span
                className={`relative h-6 w-11 shrink-0 rounded-full transition ${
                  settings.forceDemoLocation ? 'bg-ink' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                    settings.forceDemoLocation ? 'left-[22px]' : 'left-0.5'
                  }`}
                />
              </span>
              <input
                type="checkbox"
                className="sr-only"
                checked={settings.forceDemoLocation}
                onChange={(e) => onSettingsChange({ ...settings, forceDemoLocation: e.target.checked })}
              />
            </label>
          </section>

          {/* Admin onay paneli */}
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-ink-muted">
                <ShieldCheck size={13} /> Admin Onay Paneli
              </h3>
              <span className="rounded-full bg-ink px-2 py-0.5 text-[10px] font-bold text-white">Simülasyon</span>
            </div>

            <div className="mb-3 grid grid-cols-2 gap-2">
              <div className="rounded-2xl bg-brand-soft p-3">
                <div className="text-2xl font-extrabold">{pending.length}</div>
                <div className="text-[11px] font-semibold text-ink-soft">Onay bekliyor</div>
              </div>
              <div className="rounded-2xl bg-green-50 p-3">
                <div className="text-2xl font-extrabold text-green-700">{approvedCount}</div>
                <div className="text-[11px] font-semibold text-green-700/80">Topluluk onaylı</div>
              </div>
            </div>

            {pending.length === 0 ? (
              <div className="flex flex-col items-center rounded-3xl border-2 border-dashed border-gray-200 px-4 py-8 text-center">
                <Inbox size={28} className="text-gray-300" />
                <p className="mt-2 text-sm font-semibold text-ink-soft">Bekleyen başvuru yok</p>
                <p className="mt-1 text-xs text-ink-muted">Sarı “+” butonuyla yeni bir tuvalet ekleyip burada onaylayabilirsiniz.</p>
              </div>
            ) : (
              <ul className="space-y-3">
                {pending.map((t) => (
                  <li key={t.id} className="animate-slide-up overflow-hidden rounded-3xl bg-card">
                    <div className="flex gap-3 p-3">
                      <img src={t.photo} alt={t.name} className="h-16 w-16 shrink-0 rounded-2xl bg-gray-200 object-cover" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-bold">{t.name}</div>
                        <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-ink-muted">
                          <PriceBadge toilet={t} /> {CATEGORIES[t.category].label} · <Clock3 size={11} /> {timeAgo(t.createdAt)}
                        </div>
                        <div className="mt-1.5 grid grid-cols-[auto_1fr] items-center gap-x-2 gap-y-0.5 text-[10px] font-semibold text-ink-muted">
                          <span>Temizlik</span>
                          <StarRating value={t.cleanliness} size={11} />
                          <span>Konfor</span>
                          <StarRating value={t.comfort} size={11} />
                        </div>
                        <div className="mt-1 font-mono text-[10px] text-ink-muted">
                          {t.lat.toFixed(5)}, {t.lng.toFixed(5)}
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 border-t border-gray-200/70">
                      <button
                        type="button"
                        onClick={() => onReject(t.id)}
                        className="flex items-center justify-center gap-1.5 py-2.5 text-sm font-bold text-red-600 hover:bg-red-50"
                      >
                        <X size={15} /> Reddet
                      </button>
                      <button
                        type="button"
                        onClick={() => onApprove(t.id)}
                        className="flex items-center justify-center gap-1.5 border-l border-gray-200/70 bg-brand py-2.5 text-sm font-bold text-ink hover:bg-brand-dark"
                      >
                        <Check size={15} /> Onayla
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Veriler */}
          <section>
            <h3 className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-ink-muted">
              <RotateCcw size={13} /> Veriler
            </h3>
            {!confirmReset ? (
              <button
                type="button"
                onClick={() => setConfirmReset(true)}
                className="flex w-full items-center gap-3 rounded-2xl bg-card p-3.5 text-left hover:bg-gray-100"
              >
                <Trash2 size={18} className="text-red-500" />
                <div className="flex-1">
                  <div className="text-sm font-bold">Eklenen verileri sıfırla</div>
                  <div className="text-xs text-ink-muted">Onaylı ve bekleyen tüm kullanıcı kayıtlarını siler</div>
                </div>
                <ChevronRight size={16} className="text-ink-muted" />
              </button>
            ) : (
              <div className="rounded-2xl bg-red-50 p-3.5">
                <p className="text-sm font-semibold text-red-700">Emin misiniz? Bu işlem geri alınamaz.</p>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmReset(false)}
                    className="flex-1 rounded-xl bg-white py-2 text-sm font-bold"
                  >
                    Vazgeç
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onResetData();
                      setConfirmReset(false);
                    }}
                    className="flex-1 rounded-xl bg-red-600 py-2 text-sm font-bold text-white"
                  >
                    Sıfırla
                  </button>
                </div>
              </div>
            )}
          </section>

          <p className="text-center text-[11px] text-ink-muted">
            v1.0 · Harita verisi © OpenStreetMap katkıcıları
          </p>
        </div>
      </aside>
    </div>
  );
}
