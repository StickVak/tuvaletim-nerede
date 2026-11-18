import { useState } from 'react';
import { AlertTriangle, Check, ExternalLink, HeartHandshake, Trash2, X } from 'lucide-react';
import { api } from './api';
import { CATEGORIES, placePhoto } from '../../src/lib/categories';
import MiniMap from './MiniMap';
import { ConfirmDialog, EmptyState, PageHeader, relTime } from './ui';
import { REPORT_LABEL, type Act, type AdminReportGroup, type ReportType } from './types';

const TONE: Record<ReportType, string> = {
  closed: 'bg-red-500/10 text-red-600',
  no_supplies: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  crowded: 'bg-blue-500/10 text-blue-600 dark:text-blue-300',
};

/** "Temiz Kalp" ihbarları: kullanıcıların kapalı / malzeme yok / kalabalık bildirimleri */
export default function ReportsPage({ reports, act }: { reports: AdminReportGroup[]; act: Act }) {
  const [onlyFlagged, setOnlyFlagged] = useState(true);
  const [approving, setApproving] = useState<AdminReportGroup | null>(null);
  const items = onlyFlagged ? reports.filter((r) => r.flagged) : reports;
  const flaggedCount = reports.filter((r) => r.flagged).length;

  return (
    <>
      <PageHeader
        title="Temiz Kalp İhbarları"
        subtitle="Kullanıcıların bildirdiği sorunlar. Aynı sorunu en az 2 farklı kullanıcı bildirdiyse mekan şüpheli sayılır."
        actions={
          <div className="flex rounded-xl bg-surface p-1 text-sm font-bold ring-1 ring-line" role="radiogroup" aria-label="İhbar filtresi">
            {[
              [true, `Şüpheli (${flaggedCount})`],
              [false, `Tümü (${reports.length})`],
            ].map(([v, label]) => (
              <button key={String(v)} type="button" role="radio" aria-checked={onlyFlagged === v} onClick={() => setOnlyFlagged(v as boolean)}
                className={`rounded-lg px-3 py-1.5 ${onlyFlagged === v ? 'bg-ink text-surface' : 'text-ink-muted'}`}>
                {label as string}
              </button>
            ))}
          </div>
        }
      />

      {items.length === 0 ? (
        <EmptyState icon={HeartHandshake} title={onlyFlagged ? 'Şüpheli mekan yok' : 'Bekleyen ihbar yok'}
          text={onlyFlagged && reports.length ? 'Tek kullanıcıdan gelen ihbarları görmek için “Tümü”ne geçin.' : 'Kullanıcılar bir sorun bildirdiğinde burada görünür.'} />
      ) : (
        <div className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
          {items.map((g) => {
            const p = g.place;
            return (
              <article key={p.id} className={`animate-slide-up overflow-hidden rounded-3xl bg-surface shadow-sm ring-1 ${g.flagged ? 'ring-red-500/40' : 'ring-line'}`}>
                <div className="flex gap-4 p-4">
                  <img src={placePhoto(p)} alt="" className="h-20 w-20 shrink-0 rounded-2xl bg-card object-cover" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-lg font-extrabold">{p.name}</h3>
                      {g.flagged && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-bold text-white">
                          <AlertTriangle size={11} /> Şüpheli
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-ink-muted">{CATEGORIES[p.category].label} · {p.district || '—'} · son ihbar {relTime(g.lastReportAt)}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {(Object.keys(g.counts) as ReportType[]).filter((t) => g.counts[t] > 0).map((t) => (
                        <span key={t} className={`rounded-full px-2.5 py-1 text-xs font-bold ${TONE[t]}`}>
                          {REPORT_LABEL[t]} · {g.counts[t]} kullanıcı
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 px-4 md:grid-cols-2">
                  <MiniMap center={p} category={p.category} className="h-40" />
                  <ul className="max-h-40 space-y-1 overflow-y-auto text-sm" aria-label="İhbarlar">
                    {g.reports.map((r) => (
                      <li key={r.id} className="flex items-center gap-2 rounded-xl bg-card px-3 py-2">
                        <span className="min-w-0 flex-1 truncate"><b>@{r.username}</b> · {REPORT_LABEL[r.type]}</span>
                        <span className="shrink-0 text-[11px] text-ink-muted">{relTime(r.createdAt)}</span>
                        <button type="button" aria-label={`@${r.username} ihbarını sil`} title="Bu ihbarı sil"
                          onClick={() => void act(() => api(`/admin/report-items/${r.id}`, { method: 'DELETE' }), 'İhbar silindi.')}
                          className="rounded-lg p-1 text-ink-muted hover:bg-red-500/10 hover:text-red-600">
                          <Trash2 size={14} />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>

                <footer className="mt-4 flex flex-wrap items-center gap-2 border-t border-line px-4 py-3">
                  <a href={`https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lng}#map=18/${p.lat}/${p.lng}`} target="_blank" rel="noreferrer"
                    className="mr-auto inline-flex items-center gap-1 text-sm font-semibold text-ink-soft hover:text-ink">
                    <ExternalLink size={14} /> Haritada aç
                  </a>
                  <button type="button" onClick={() => void act(() => api(`/admin/reports/${encodeURIComponent(p.id)}/reject`, { method: 'POST' }), `“${p.name}” ihbarları reddedildi.`)}
                    className="flex items-center gap-1.5 rounded-xl bg-card px-4 py-2.5 text-sm font-bold hover:bg-line/60">
                    <X size={15} /> Reddet
                  </button>
                  <button type="button" onClick={() => setApproving(g)}
                    className="flex items-center gap-1.5 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-700">
                    <Check size={15} /> Onayla · Kalıcı kapat
                  </button>
                </footer>
              </article>
            );
          })}
        </div>
      )}

      {approving && (
        <ConfirmDialog
          title="Mekanı kalıcı kapalı işaretle"
          text={<><b>“{approving.place.name}”</b> haritadan gizlenecek (silinmez). İstediğiniz zaman Mekanlar sayfasından yeniden açabilirsiniz.</>}
          confirmLabel="Kalıcı kapat"
          onCancel={() => setApproving(null)}
          onConfirm={() => {
            const { id, name } = approving.place;
            setApproving(null);
            void act(() => api(`/admin/reports/${encodeURIComponent(id)}/approve`, { method: 'POST' }), `“${name}” kalıcı kapalı işaretlendi.`);
          }}
        />
      )}
    </>
  );
}
