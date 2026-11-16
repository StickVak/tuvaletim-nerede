interface Props {
  isPaid: boolean | null;
  price: string;
  onChange: (isPaid: boolean, price: string) => void;
}

/** Puanlamanın altında: yan yana Ücretli / Ücretsiz; Ücretli seçilince tutar alanı */
export default function FeeVoteInput({ isPaid, price, onChange }: Props) {
  const btn = (active: boolean, tone: string) =>
    `rounded-xl py-2.5 text-sm font-bold transition ${active ? `${tone} shadow-sm` : 'text-ink-muted hover:text-ink'}`;
  return (
    <div>
      <div className="grid grid-cols-2 gap-1 rounded-2xl bg-card p-1" role="radiogroup" aria-label="Ücret durumu">
        <button type="button" role="radio" aria-checked={isPaid === true} onClick={() => onChange(true, price)} className={btn(isPaid === true, 'bg-brand text-onbrand')}>
          Ücretli
        </button>
        <button type="button" role="radio" aria-checked={isPaid === false} onClick={() => onChange(false, price)} className={btn(isPaid === false, 'bg-green-500 text-white')}>
          Ücretsiz
        </button>
      </div>
      {isPaid && (
        <label className="mt-2 block">
          <span className="mb-1 block text-xs font-bold text-ink-soft">Ücret Tutarı (₺)</span>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            max={1000}
            step={0.5}
            value={price}
            onChange={(e) => onChange(true, e.target.value)}
            placeholder="örn. 10"
            className="w-full rounded-2xl border-2 border-transparent bg-surface px-4 py-2.5 text-[15px] font-medium outline-none focus:border-brand-dark"
          />
        </label>
      )}
    </div>
  );
}

/** Formdaki tutar metnini API değerine çevirir; boş → null */
export function parsePrice(price: string): number | null {
  const n = Number(price.replace(',', '.'));
  return price.trim() === '' || Number.isNaN(n) ? null : n;
}
