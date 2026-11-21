import { useState } from 'react';
import { Inbox } from 'lucide-react';
import { api } from './api';
import type { AdminPending } from './types';
import PendingCard from './PendingCard';
import { ConfirmDialog, EmptyState, PageHeader } from './ui';

type Act = (fn: () => Promise<unknown>, success: string) => Promise<boolean>;

/** Bekleyen başvurular: her kart kendi içinde düzenlenir, kaydedilir ve onaylanır (açılır pencere yok) */
export default function PendingPage({ pending, act }: { pending: AdminPending[]; act: Act }) {
  const [rejecting, setRejecting] = useState<AdminPending | null>(null);

  return (
    <>
      <PageHeader title="Bekleyen Başvurular" subtitle="Kullanıcıların “+” ile eklediği mekanları kart üzerinde düzenleyip onaylayın" />
      {pending.length === 0 ? (
        <EmptyState icon={Inbox} title="Bekleyen başvuru yok" text="Yeni bir mekan eklendiğinde burada görünecek." />
      ) : (
        <div className="space-y-5">
          {pending.map((s) => (
            <PendingCard
              key={s.id}
              pending={s}
              onSave={(changes) => act(() => api(`/admin/pending/${encodeURIComponent(s.id)}`, { method: 'PATCH', body: changes }), 'Başvuru güncellendi.')}
              onApprove={() => act(() => api(`/admin/pending/${encodeURIComponent(s.id)}/approve`, { method: 'POST' }), `“${s.name}” onaylandı ve haritaya eklendi.`)}
              onReject={() => setRejecting(s)}
            />
          ))}
        </div>
      )}

      {rejecting && (
        <ConfirmDialog
          title="Başvuruyu reddet"
          text={<>“{rejecting.name}” başvurusu kalıcı olarak silinecek.</>}
          confirmLabel="Reddet"
          onCancel={() => setRejecting(null)}
          onConfirm={() => {
            const id = rejecting.id;
            setRejecting(null);
            void act(() => api(`/admin/pending/${encodeURIComponent(id)}`, { method: 'DELETE' }), 'Başvuru reddedildi.');
          }}
        />
      )}
    </>
  );
}
