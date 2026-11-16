import { AlertCircle, CheckCircle2, Info } from 'lucide-react';
import type { ToastMessage } from '../types';

export default function Toasts({ toasts, desktop }: { toasts: ToastMessage[]; desktop?: boolean }) {
  return (
    <div
      className={`pointer-events-none absolute z-[60] flex flex-col items-center gap-2 px-4 ${
        desktop ? 'bottom-6 left-[432px] right-0' : 'inset-x-0 top-20'
      }`}
    >
      {toasts.map((t) => {
        const Icon = t.tone === 'success' ? CheckCircle2 : t.tone === 'error' ? AlertCircle : Info;
        const color = t.tone === 'success' ? 'text-green-400' : t.tone === 'error' ? 'text-red-400' : 'text-brand';
        return (
          <div
            key={t.id}
            role="status"
            className="flex max-w-full animate-slide-down items-start gap-2.5 rounded-2xl bg-night px-4 py-3 text-sm font-medium text-white shadow-float"
          >
            <Icon size={18} className={`mt-px shrink-0 ${color}`} />
            <span>{t.text}</span>
          </div>
        );
      })}
    </div>
  );
}
