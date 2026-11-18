import { useEffect, useMemo, useState } from 'react';
import { Flag, Loader2, MapPinPlus, MessageSquareText, Search, Trash2, UserX, Users, X } from 'lucide-react';
import { api } from './api';
import StarRating from '../../src/components/StarRating';
import { CATEGORIES } from '../../src/lib/categories';
import { ConfirmDialog, EmptyState, PageHeader, relTime } from './ui';
import { REPORT_LABEL, type Act, type AdminUser, type AdminUserDetail } from './types';

/** Kullanıcı aktivitelerini ve raporlarını denetleme */
export default function UsersPage({ users, act }: { users: AdminUser[]; act: Act }) {
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState<number | null>(null);
  const items = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase('tr-TR');
    return users.filter((u) => !needle || `${u.username} ${u.displayName}`.toLocaleLowerCase('tr-TR').includes(needle));
  }, [users, q]);

  return (
    <>
      <PageHeader title="Kullanıcılar" subtitle={`${users.length} kayıtlı kullanıcı · son etkinliğe göre sıralı`} />
      <label className="mb-4 flex max-w-md items-center gap-2 rounded-xl bg-surface px-3.5 py-2.5 ring-1 ring-line focus-within:ring-2 focus-within:ring-brand-dark">
        <Search size={16} className="text-ink-muted" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Kullanıcı adı ara" className="w-full bg-transparent text-sm outline-none" />
      </label>

      {items.length === 0 ? (
        <EmptyState icon={Users} title="Kullanıcı bulunamadı" />
      ) : (
        <div className="overflow-x-auto rounded-3xl bg-surface shadow-sm ring-1 ring-line">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="text-left text-xs font-bold uppercase tracking-wide text-ink-muted">
              <tr className="border-b border-line">
                <th className="px-4 py-3">Kullanıcı</th>
                <th className="px-2 py-3 text-right">Oy</th>
                <th className="px-2 py-3 text-right">Yorum</th>
                <th className="px-2 py-3 text-right">İhbar</th>
                <th className="px-2 py-3 text-right">Eklenen</th>
                <th className="px-2 py-3 text-right">Bekleyen</th>
                <th className="px-4 py-3">Son etkinlik</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {items.map((u) => (
                <tr key={u.id} onClick={() => setOpenId(u.id)} className="cursor-pointer hover:bg-card/60">
                  <td className="px-4 py-3">
                    <button type="button" className="text-left" onClick={() => setOpenId(u.id)}>
                      <span className="block font-bold">{u.displayName}</span>
                      <span className="text-xs text-ink-muted">@{u.username} · üye {relTime(u.createdAt)}</span>
                    </button>
                  </td>
                  <td className="px-2 py-3 text-right tabular-nums">{u.votes}</td>
                  <td className="px-2 py-3 text-right tabular-nums">{u.comments}</td>
                  <td className="px-2 py-3 text-right tabular-nums">{u.reports}</td>
                  <td className="px-2 py-3 text-right tabular-nums">{u.placesAdded}</td>
                  <td className="px-2 py-3 text-right tabular-nums">{u.pending}</td>
                  <td className="px-4 py-3 text-ink-muted">{u.lastActiveAt ? relTime(u.lastActiveAt) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {openId !== null && <UserDetail id={openId} act={act} onClose={() => setOpenId(null)} />}
    </>
  );
}

function UserDetail({ id, act, onClose }: { id: number; act: Act; onClose: () => void }) {
  const [data, setData] = useState<AdminUserDetail | null>(null);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    api<AdminUserDetail>(`/admin/users/${id}`).then(setData, (e: Error) => setError(e.message));
  }, [id, version]);

  const run = async (fn: () => Promise<unknown>, msg: string) => {
    if (await act(fn, msg)) setVersion((v) => v + 1);
  };

  return (
    <div className="fixed inset-0 z-[900] flex justify-end" role="dialog" aria-modal="true" aria-label="Kullanıcı ayrıntısı">
      <div className="absolute inset-0 animate-fade-in bg-black/50" onClick={onClose} />
      <aside className="relative flex h-full w-full max-w-xl animate-slide-up flex-col bg-surface shadow-2xl">
        <header className="flex items-center justify-between border-b border-line px-6 py-4">
          <div>
            <h2 className="text-lg font-extrabold">{data?.user.displayName ?? 'Kullanıcı'}</h2>
            {data && <p className="text-xs text-ink-muted">@{data.user.username} · üye {relTime(data.user.createdAt)}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Kapat" className="rounded-full bg-card p-2 hover:bg-line/60"><X size={18} /></button>
        </header>

        <div className="flex-1 space-y-6 overflow-y-auto p-6">
          {error && <p className="rounded-xl bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-600">{error}</p>}
          {!data && !error && <Loader2 className="mx-auto animate-spin text-ink-muted" />}
          {data && (
            <>
              <Section icon={MessageSquareText} title={`Oylar ve yorumlar (${data.votes.length})`}>
                {data.votes.map((v) => (
                  <li key={v.id} className="flex items-start gap-3 rounded-2xl bg-card p-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-sm font-bold">
                        <span className="truncate">{v.placeName}</span>
                        <StarRating value={(v.cleanliness + v.comfort) / 2} size={11} />
                      </div>
                      {v.comment && <p className="mt-0.5 text-sm text-ink-soft">{v.comment}</p>}
                      <p className="mt-0.5 text-[11px] text-ink-muted">{v.isPaid ? `Ücretli${v.priceAmount ? ` ${v.priceAmount} ₺` : ''}` : 'Ücretsiz'} · {relTime(v.updatedAt)}</p>
                    </div>
                    <button type="button" aria-label="Oyu sil" title="Oyu sil" onClick={() => void run(() => api(`/admin/votes/${v.id}`, { method: 'DELETE' }), 'Oy silindi.')}
                      className="rounded-lg p-1.5 text-ink-muted hover:bg-red-500/10 hover:text-red-600"><Trash2 size={15} /></button>
                  </li>
                ))}
              </Section>

              <Section icon={Flag} title={`İhbarlar (${data.reports.length})`}>
                {data.reports.map((r) => (
                  <li key={r.id} className="flex items-center gap-3 rounded-2xl bg-card px-3 py-2 text-sm">
                    <span className="min-w-0 flex-1 truncate"><b>{r.placeName}</b> · {REPORT_LABEL[r.type]}</span>
                    {r.resolvedAt && <span className="rounded-full bg-surface px-2 py-0.5 text-[10px] font-bold text-ink-muted">Çözüldü</span>}
                    <span className="shrink-0 text-[11px] text-ink-muted">{relTime(r.createdAt)}</span>
                    <button type="button" aria-label="İhbarı sil" title="İhbarı sil" onClick={() => void run(() => api(`/admin/report-items/${r.id}`, { method: 'DELETE' }), 'İhbar silindi.')}
                      className="rounded-lg p-1.5 text-ink-muted hover:bg-red-500/10 hover:text-red-600"><Trash2 size={14} /></button>
                  </li>
                ))}
              </Section>

              <Section icon={MapPinPlus} title={`Eklediği mekanlar (${data.placesAdded.length}) · bekleyen başvuru (${data.pending.length})`}>
                {data.placesAdded.map((p) => (
                  <li key={p.id} className="flex items-center gap-2 rounded-2xl bg-card px-3 py-2 text-sm">
                    <span className="flex-1 truncate font-bold">{p.name}</span>
                    <span className="text-xs text-ink-muted">{CATEGORIES[p.category].label}</span>
                    {p.closedAt && <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-bold text-red-600">Kapalı</span>}
                  </li>
                ))}
                {data.pending.map((p) => (
                  <li key={p.id} className="flex items-center gap-2 rounded-2xl border border-dashed border-line px-3 py-2 text-sm">
                    <span className="flex-1 truncate">{p.name}</span>
                    <span className="text-xs text-ink-muted">başvuru · {relTime(p.submittedAt)}</span>
                  </li>
                ))}
              </Section>
            </>
          )}
        </div>

        {data && (
          <footer className="border-t border-line px-6 py-4">
            <button type="button" onClick={() => setDeleting(true)} className="flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-bold text-red-600 hover:bg-red-500/10">
              <UserX size={16} /> Kullanıcıyı sil
            </button>
          </footer>
        )}
      </aside>

      {deleting && data && (
        <ConfirmDialog
          title="Kullanıcıyı sil"
          text={<><b>@{data.user.username}</b> hesabı, {data.votes.length} oyu ve {data.reports.length} ihbarı kalıcı olarak silinecek. Eklediği mekanlar kalır.</>}
          confirmLabel="Kullanıcıyı sil"
          onCancel={() => setDeleting(false)}
          onConfirm={async () => {
            setDeleting(false);
            if (await act(() => api(`/admin/users/${id}`, { method: 'DELETE' }), `@${data.user.username} silindi.`)) onClose();
          }}
        />
      )}
    </div>
  );
}

function Section({ icon: Icon, title, children }: { icon: typeof Flag; title: string; children: React.ReactNode }) {
  const empty = !(Array.isArray(children) ? children.flat().filter(Boolean).length : children);
  return (
    <section>
      <h3 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-ink-muted"><Icon size={14} /> {title}</h3>
      {empty ? <p className="text-sm text-ink-muted">Kayıt yok.</p> : <ul className="space-y-1.5">{children}</ul>}
    </section>
  );
}
