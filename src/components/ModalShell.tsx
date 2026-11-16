import type { ReactNode } from 'react';
import { X } from 'lucide-react';

/** Mobilde alttan açılan, masaüstünde ortalanmış pencere */
export default function ModalShell({ label, onClose, children, z = 'z-[55]' }: { label: string; onClose: () => void; children: ReactNode; z?: string }) {
  return (
    <div className={`absolute inset-0 ${z} flex items-end justify-center sm:items-center sm:p-4`} role="dialog" aria-modal="true" aria-label={label}>
      <div className="absolute inset-0 animate-fade-in bg-black/50" onClick={onClose} />
      <div className="relative flex max-h-[92%] w-full max-w-md animate-sheet-in flex-col overflow-hidden rounded-t-[30px] bg-surface text-ink shadow-2xl sm:animate-slide-up sm:rounded-[30px]">
        <button type="button" onClick={onClose} aria-label="Kapat" className="absolute right-3 top-3 z-10 rounded-full bg-card p-2 text-ink">
          <X size={18} />
        </button>
        <div className="no-scrollbar flex-1 overflow-y-auto overscroll-contain">{children}</div>
      </div>
    </div>
  );
}
