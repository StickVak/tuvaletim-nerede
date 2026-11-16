import { ArrowDownWideNarrow, Check } from 'lucide-react';
import type { FilterChip, Filters, SortMode } from '../types';
import { CHIP_LABELS, SORT_LABELS } from '../lib/filters';

export function Toggle({ on, tone = 'green' }: { on: boolean; tone?: 'green' | 'ink' }) {
  return (
    <span className={`relative h-6 w-11 shrink-0 rounded-full transition ${on ? (tone === 'green' ? 'bg-green-500' : 'bg-ink') : 'bg-ink-muted/40'}`}>
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
    </span>
  );
}

export default function FilterPanel({ filters, onChange, compact }: { filters: Filters; onChange: (f: Filters) => void; compact?: boolean }) {
  const toggle = (c: FilterChip) =>
    onChange({ ...filters, chips: filters.chips.includes(c) ? filters.chips.filter((x) => x !== c) : [...filters.chips, c] });
  return (
    <div>
      <label className="flex items-center gap-2 rounded-2xl bg-card px-3 py-2 text-sm font-semibold text-ink">
        <ArrowDownWideNarrow size={16} className="shrink-0 text-ink-muted" />
        <span className="sr-only">Sıralama</span>
        <select
          value={filters.sort}
          onChange={(e) => onChange({ ...filters, sort: e.target.value as SortMode })}
          aria-label="Sıralama"
          className="w-full cursor-pointer bg-transparent font-bold text-ink outline-none"
        >
          {(Object.keys(SORT_LABELS) as SortMode[]).map((s) => (
            <option key={s} value={s} className="bg-surface text-ink">
              {SORT_LABELS[s]}
            </option>
          ))}
        </select>
      </label>
      <div className={`mt-2 flex flex-wrap gap-1.5 ${compact ? '' : 'px-0.5'}`} role="group" aria-label="Filtreler">
        {(Object.keys(CHIP_LABELS) as FilterChip[]).map((c) => {
          const on = filters.chips.includes(c);
          return (
            <button
              key={c}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(c)}
              className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold transition ${
                on ? 'bg-brand text-onbrand' : 'bg-card text-ink-soft ring-1 ring-line hover:text-ink'
              }`}
            >
              {on && <Check size={12} strokeWidth={3} />}
              {CHIP_LABELS[c]}
            </button>
          );
        })}
      </div>
      {filters.chips.length > 0 && (
        <button type="button" onClick={() => onChange({ ...filters, chips: [] })} className="mt-2 text-xs font-bold text-ink-muted hover:text-ink">
          Filtreleri temizle ({filters.chips.length})
        </button>
      )}
    </div>
  );
}
