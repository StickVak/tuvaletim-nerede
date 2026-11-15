import { AlertCircle, CheckCircle2, Info } from 'lucide-react';
import type { ToastMessage } from '../types';

export default function Toasts({ toasts }: { toasts: ToastMessage[] }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-20 z-[60] flex flex-col items-center gap-2 px-4">
      {toasts.map((t) => {
        const Icon = t.tone === 'success' ? CheckCircle2 : t.tone === 'error' ? AlertCircle : Info;
        const color = t.tone === 'success' ? 'text-green-400' : t.tone === 'error' ? 'text-red-400' : 'text-brand';
        return (
          <div
            key={t.id}
            role="status"
            className="flex max-w-full animate-slide-down items-start gap-2.5 rounded-2xl bg-ink px-4 py-3 text-sm font-medium text-white shadow-float"
          >
            <Icon size={18} className={`mt-px shrink-0 ${color}`} />
            <span>{t.text}</span>
          </div>
        );
      })}
    </div>
  );
}
