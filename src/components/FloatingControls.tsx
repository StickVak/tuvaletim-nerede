import { useEffect, useRef, useState } from 'react';
import { ArrowDownWideNarrow, Check, LocateFixed, Navigation, Plus, Sparkles, SlidersHorizontal, X } from 'lucide-react';
import type { Filters, SortMode } from '../types';

interface Props {
  filters: Filters;
  onFiltersChange: (f: Filters) => void;
  onLocate: () => void;
  onAdd: () => void;
  /** Alt panelin üst kenarından itibaren konum (px) */
  bottom: number;
  hidden?: boolean;
}

const SORTS: { value: SortMode; label: string; icon: typeof Navigation }[] = [
  { value: 'distance', label: 'Yakınlığa göre', icon: Navigation },
  { value: 'cleanliness', label: 'Temizlik puanına göre', icon: Sparkles },
];

export default function FloatingControls({ filters, onFiltersChange, onLocate, onAdd, bottom, hidden }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = filters.freeOnly || filters.sort !== 'distance';

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  return (
    <div
      ref={ref}
      style={{ bottom }}
      className={`absolute right-4 z-20 flex flex-col items-end gap-3 transition-all duration-300 ease-[cubic-bezier(.2,.8,.2,1)] ${
        hidden ? 'pointer-events-none translate-x-24 opacity-0' : ''
      }`}
    >
      <div className="relative">
        <button
          type="button"
          aria-label="Filtre ve sıralama"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className={`flex h-12 w-12 items-center justify-center rounded-full shadow-float transition active:scale-95 ${
            open ? 'bg-ink text-white' : 'bg-white text-ink'
          }`}
        >
          {open ? <X size={20} /> : <SlidersHorizontal size={20} />}
          {active && !open && <span className="absolute right-1 top-1 h-3 w-3 rounded-full border-2 border-white bg-brand-dark" />}
        </button>

        {open && (
          <div className="absolute bottom-0 right-14 w-64 animate-fade-in rounded-3xl bg-white p-3 shadow-float">
            <p className="flex items-center gap-1.5 px-2 pb-2 pt-1 text-[11px] font-bold uppercase tracking-wider text-ink-muted">
              <ArrowDownWideNarrow size={13} /> Sıralama
            </p>
            {SORTS.map((s) => {
              const selected = filters.sort === s.value;
              return (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => onFiltersChange({ ...filters, sort: s.value })}
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
              <span
                className={`relative h-6 w-11 rounded-full transition ${filters.freeOnly ? 'bg-green-500' : 'bg-gray-300'}`}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                    filters.freeOnly ? 'left-[22px]' : 'left-0.5'
                  }`}
                />
              </span>
              <input
                type="checkbox"
                className="sr-only"
                checked={filters.freeOnly}
                onChange={(e) => onFiltersChange({ ...filters, freeOnly: e.target.checked })}
              />
            </label>
          </div>
        )}
      </div>

      <button
        type="button"
        aria-label="Konumuma odaklan"
        onClick={onLocate}
        className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-blue-600 shadow-float transition active:scale-95"
      >
        <LocateFixed size={21} />
      </button>

      <button
        type="button"
        aria-label="Tuvalet ekle"
        onClick={onAdd}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-brand text-ink shadow-float ring-4 ring-white transition hover:bg-brand-dark active:scale-95"
      >
        <Plus size={28} strokeWidth={2.75} />
      </button>
    </div>
  );
}
