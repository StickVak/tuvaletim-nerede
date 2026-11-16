import { Search, X } from 'lucide-react';

export default function SearchBox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center gap-2 rounded-2xl bg-card px-3.5 py-2.5 ring-brand-dark focus-within:bg-surface focus-within:ring-2" data-no-drag>
      <Search size={17} className="shrink-0 text-ink-muted" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Mekan, ilçe veya şehir ara"
        className="min-w-0 flex-1 bg-transparent text-sm font-medium outline-none placeholder:text-ink-muted"
        aria-label="Mekan ara"
      />
      {value && (
        <button type="button" onClick={() => onChange('')} aria-label="Aramayı temizle" className="rounded-full p-0.5 text-ink-muted hover:bg-line">
          <X size={15} />
        </button>
      )}
    </label>
  );
}
