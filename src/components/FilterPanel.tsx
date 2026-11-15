import { ArrowDownWideNarrow, Check, Navigation, Sparkles } from 'lucide-react';
import type { Filters, SortMode } from '../types';

const SORTS: { value: SortMode; label: string; icon: typeof Navigation }[] = [
  { value: 'distance', label: 'Yakınlığa göre', icon: Navigation },
  { value: 'cleanliness', label: 'Temizlik puanına göre', icon: Sparkles },
];

export function Toggle({ on, tone = 'green' }: { on: boolean; tone?: 'green' | 'ink' }) {
  return (
    <span className={`relative h-6 w-11 shrink-0 rounded-full transition ${on ? (tone === 'green' ? 'bg-green-500' : 'bg-ink') : 'bg-gray-300'}`}>
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
    </span>
  );
}

export default function FilterPanel({ filters, onChange }: { filters: Filters; onChange: (f: Filters) => void }) {
  return (
    <div>
      <p className="flex items-center gap-1.5 px-2 pb-2 pt-1 text-[11px] font-bold uppercase tracking-wider text-ink-muted">
        <ArrowDownWideNarrow size={13} /> Sıralama
      </p>
      {SORTS.map((s) => {
        const selected = filters.sort === s.value;
        return (
          <button
            key={s.value}
            type="button"
            onClick={() => onChange({ ...filters, sort: s.value })}
            className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm font-semibold transition ${
              selected ? 'bg-brand-soft text-ink' : 'text-ink-soft hover:bg-card'
            }`}
          >
            <s.icon size={17} />
            <span className="flex-1">{s.label}</span>
            {selected && <Check size={16} />}
          </button>
        );
      })}
      <div className="my-2 h-px bg-gray-100" />
      <label className="flex cursor-pointer items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold text-ink hover:bg-card">
        <span className="flex-1">Sadece ücretsizler</span>
        <Toggle on={filters.freeOnly} />
        <input
          type="checkbox"
          className="sr-only"
          checked={filters.freeOnly}
          onChange={(e) => onChange({ ...filters, freeOnly: e.target.checked })}
        />
      </label>
    </div>
  );
}
