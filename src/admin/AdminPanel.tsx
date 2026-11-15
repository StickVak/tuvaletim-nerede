import { useCallback, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Building2, CheckCircle2, ExternalLink, Inbox, LayoutDashboard, LogOut, MessageSquareText } from 'lucide-react';
import type { AdminUser } from '../types';
import { db } from '../db/db';
import Logo from '../components/Logo';
import Dashboard from './Dashboard';
import PendingPage from './PendingPage';
import PlacesPage from './PlacesPage';
import ReviewsPage from './ReviewsPage';

export type AdminTab = 'dashboard' | 'pending' | 'places' | 'reviews';

const TABS: { id: AdminTab; label: string; icon: typeof Inbox }[] = [
  { id: 'dashboard', label: 'Genel Bakış', icon: LayoutDashboard },
  { id: 'pending', label: 'Başvurular', icon: Inbox },
  { id: 'places', label: 'Mekanlar', icon: Building2 },
  { id: 'reviews', label: 'Yorumlar', icon: MessageSquareText },
];

function readTab(): AdminTab {
  const h = window.location.hash.slice(1) as AdminTab;
  return TABS.some((t) => t.id === h) ? h : 'dashboard';
}

export default function AdminPanel({ user, onLogout }: { user: AdminUser; onLogout: () => void }) {
  const [tab, setTabState] = useState<AdminTab>(readTab);
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);
  const places = useLiveQuery(() => db.places.toArray(), []) ?? [];
  const pending = useLiveQuery(() => db.pending_submissions.toArray(), []) ?? [];
  const reviews = useLiveQuery(() => db.reviews.toArray(), []) ?? [];

  const setTab = (t: AdminTab) => {
    setTabState(t);
    history.replaceState(null, '', `#${t}`);
    window.scrollTo({ top: 0 });
  };

  const showToast = useCallback((text: string) => {
    const id = Date.now();
    setToast({ id, text });
    window.setTimeout(() => setToast((t) => (t?.id === id ? null : t)), 3200);
  }, []);

  const badge = (id: AdminTab) => (id === 'pending' ? pending.length : 0);

  return (
    <div className="min-h-[100dvh] bg-card lg:pl-[260px]">
      {/* Masaüstü yan menü */}
      <aside className="fixed inset-y-0 left-0 hidden w-[260px] flex-col bg-ink p-5 text-white lg:flex">
        <div className="flex items-center gap-3">
          <Logo size={42} />
          <div>
            <div className="font-extrabold leading-tight">Tuvaletim Nerede?</div>
            <div className="text-xs text-white/60">Yönetim Paneli</div>
          </div>
        </div>
        <nav className="mt-8 space-y-1" aria-label="Yönetim menüsü">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              aria-current={tab === t.id ? 'page' : undefined}
              className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-sm font-bold transition ${
                tab === t.id ? 'bg-brand text-ink' : 'text-white/75 hover:bg-white/10 hover:text-white'
              }`}
            >
              <t.icon size={18} />
              <span className="flex-1 text-left">{t.label}</span>
              {badge(t.id) > 0 && (
                <span className={`rounded-full px-2 py-0.5 text-[11px] ${tab === t.id ? 'bg-ink text-white' : 'bg-red-500 text-white'}`}>{badge(t.id)}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="mt-auto space-y-2">
          <a href="/" target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold text-white/75 hover:bg-white/10">
            <ExternalLink size={16} /> Uygulamayı aç
          </a>
          <div className="rounded-2xl bg-white/5 p-3">
            <div className="text-xs text-white/50">Oturum açık</div>
            <div className="font-bold">{user.username}</div>
            <button type="button" onClick={onLogout} className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-white/10 py-2 text-sm font-bold hover:bg-white/20">
              <LogOut size={15} /> Çıkış yap
            </button>
          </div>
        </div>
      </aside>

      {/* Mobil üst bar */}
      <header className="sticky top-0 z-[500] bg-ink text-white lg:hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2.5">
            <Logo size={34} />
            <span className="font-extrabold">Yönetim Paneli</span>
          </div>
          <button type="button" onClick={onLogout} className="flex items-center gap-1.5 rounded-xl bg-white/10 px-3 py-2 text-xs font-bold">
            <LogOut size={14} /> Çıkış
          </button>
        </div>
        <nav className="no-scrollbar flex gap-1 overflow-x-auto px-3 pb-3" aria-label="Yönetim menüsü">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-bold ${
                tab === t.id ? 'bg-brand text-ink' : 'bg-white/10 text-white/80'
              }`}
            >
              <t.icon size={14} /> {t.label}
              {badge(t.id) > 0 && <span className="rounded-full bg-red-500 px-1.5 text-[10px] text-white">{badge(t.id)}</span>}
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">
        {tab === 'dashboard' && <Dashboard places={places} pending={pending} reviews={reviews} onNavigate={setTab} />}
        {tab === 'pending' && <PendingPage pending={pending} onToast={showToast} />}
        {tab === 'places' && <PlacesPage places={places} reviews={reviews} onToast={showToast} />}
        {tab === 'reviews' && <ReviewsPage reviews={reviews} places={places} onToast={showToast} />}
      </main>

      {toast && (
        <div role="status" className="fixed bottom-6 left-1/2 z-[1100] flex -translate-x-1/2 animate-slide-up items-center gap-2 rounded-2xl bg-ink px-4 py-3 text-sm font-semibold text-white shadow-float lg:left-[calc(50%+130px)]">
          <CheckCircle2 size={17} className="text-green-400" /> {toast.text}
        </div>
      )}
    </div>
  );
}
