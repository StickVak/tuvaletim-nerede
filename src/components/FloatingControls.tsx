import { useEffect, useRef, useState } from 'react';
import { LocateFixed, Minus, Plus, SlidersHorizontal, X } from 'lucide-react';
import type { Filters } from '../types';
import FilterPanel from './FilterPanel';

interface Props {
  desktop: boolean;
  filters: Filters;
  onFiltersChange: (f: Filters) => void;
  onLocate: () => void;
  onAdd: () => void;
  onZoom: (delta: 1 | -1) => void;
  /** Mobilde alt panelin üst kenarına göre konum (px) */
  bottom: number;
  hidden?: boolean;
}

const round = 'flex h-12 w-12 items-center justify-center rounded-full bg-white text-ink shadow-float transition active:scale-95';

export default function FloatingControls({ desktop, filters, onFiltersChange, onLocate, onAdd, onZoom, bottom, hidden }: Props) {
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
      style={desktop ? undefined : { bottom }}
      className={`absolute right-4 z-20 flex flex-col items-end gap-3 transition-all duration-300 ease-[cubic-bezier(.2,.8,.2,1)] ${
        desktop ? 'top-1/2 -translate-y-1/2' : ''
      } ${hidden ? 'pointer-events-none translate-x-24 opacity-0' : ''}`}
    >
      {desktop ? (
        <div className="flex flex-col overflow-hidden rounded-full bg-white shadow-float">
          <button type="button" aria-label="Yakınlaştır" onClick={() => onZoom(1)} className="flex h-12 w-12 items-center justify-center hover:bg-card">
            <Plus size={20} />
          </button>
          <span className="mx-3 h-px bg-gray-200" />
          <button type="button" aria-label="Uzaklaştır" onClick={() => onZoom(-1)} className="flex h-12 w-12 items-center justify-center hover:bg-card">
            <Minus size={20} />
          </button>
        </div>
      ) : (
        <div className="relative">
          <button
            type="button"
            aria-label="Filtre ve sıralama"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            className={`${round} ${open ? '!bg-ink !text-white' : ''}`}
          >
            {open ? <X size={20} /> : <SlidersHorizontal size={20} />}
            {active && !open && <span className="absolute right-1 top-1 h-3 w-3 rounded-full border-2 border-white bg-brand-dark" />}
          </button>
          {open && (
            <div className="absolute bottom-0 right-14 w-64 animate-fade-in rounded-3xl bg-white p-3 shadow-float">
              <FilterPanel filters={filters} onChange={onFiltersChange} />
            </div>
          )}
        </div>
      )}

      <button type="button" aria-label="Konumuma odaklan" onClick={onLocate} className={`${round} !text-blue-600`}>
        <LocateFixed size={21} />
      </button>

      <button
        type="button"
        aria-label="Tuvalet ekle"
        title="Tuvalet ekle"
        onClick={onAdd}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-brand text-ink shadow-float ring-4 ring-white transition hover:bg-brand-dark active:scale-95"
      >
        <Plus size={28} strokeWidth={2.75} />
      </button>
    </div>
  );
}
