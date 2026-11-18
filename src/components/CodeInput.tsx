import { useEffect, useRef } from 'react';

/** 6 haneli doğrulama kodu: otomatik ilerleme, geri silme, yapıştırma ve SMS/e-posta otomatik doldurma */
export default function CodeInput({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = Array.from({ length: 6 }, (_, i) => value[i] ?? '');

  // Kod temizlenince (ör. hatalı kod) ilk kutuya dön
  useEffect(() => {
    if (!value) refs.current[0]?.focus();
  }, [value]);

  /** Haneler sola kaymaz: silme o haneden sonrasını temizler, yeni rakam ilk boş kutuya yazılır */
  const setAt = (i: number, d: string) => {
    if (!d) {
      onChange(value.slice(0, i));
      return;
    }
    const next = i < value.length ? value.slice(0, i) + d + value.slice(i + 1) : value + d;
    onChange(next.slice(0, 6));
    refs.current[Math.min(i < value.length ? i + 1 : next.length, 5)]?.focus();
  };

  const fill = (text: string, from: number) => {
    const clean = text.replace(/\D/g, '');
    if (!clean) return;
    const next = (value.slice(0, from) + clean).slice(0, 6);
    onChange(next);
    refs.current[Math.min(next.length, 5)]?.focus();
  };

  return (
    <div className="flex justify-between gap-2" role="group" aria-label="Doğrulama kodu">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => (refs.current[i] = el)}
          value={d}
          disabled={disabled}
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          aria-label={`Kodun ${i + 1}. hanesi`}
          autoFocus={i === 0}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, '');
            if (v.length > 1) return fill(v, i); // otomatik doldurma / yapıştırma
            setAt(i, v);
          }}
          onFocus={() => {
            // Boş bir kutuya tıklanırsa ilk boş kutuya git (sıra korunur)
            if (i > value.length) refs.current[value.length]?.focus();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Backspace' && !d && i > 0) {
              e.preventDefault();
              onChange(value.slice(0, i - 1));
              refs.current[i - 1]?.focus();
            }
            if (e.key === 'ArrowLeft' && i > 0) refs.current[i - 1]?.focus();
            if (e.key === 'ArrowRight' && i < 5) refs.current[i + 1]?.focus();
          }}
          onPaste={(e) => {
            e.preventDefault();
            fill(e.clipboardData.getData('text'), i);
          }}
          className="h-14 w-full min-w-0 rounded-2xl border-2 border-transparent bg-card text-center text-2xl font-extrabold tabular-nums text-ink outline-none transition focus:border-brand-dark disabled:opacity-60"
        />
      ))}
    </div>
  );
}
