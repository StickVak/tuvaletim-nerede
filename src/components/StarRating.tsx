import { Star } from 'lucide-react';

interface Props {
  value: number;
  onChange?: (v: number) => void;
  size?: number;
  label?: string;
}

export default function StarRating({ value, onChange, size = 14, label }: Props) {
  const interactive = Boolean(onChange);
  return (
    <div className="flex items-center gap-0.5" role={interactive ? 'radiogroup' : undefined} aria-label={label}>
      {[1, 2, 3, 4, 5].map((i) => {
        const filled = value >= i - 0.25;
        const half = !filled && value >= i - 0.75;
        const star = (
          <span className="relative inline-flex" style={{ width: size, height: size }}>
            <Star size={size} className="absolute text-gray-300" fill="currentColor" strokeWidth={0} />
            {(filled || half) && (
              <span className="absolute inset-0 overflow-hidden" style={{ width: filled ? '100%' : '50%' }}>
                <Star size={size} className="text-brand-dark" fill="currentColor" strokeWidth={0} />
              </span>
            )}
          </span>
        );
        return interactive ? (
          <button
            key={i}
            type="button"
            role="radio"
            aria-checked={value === i}
            aria-label={`${i} yıldız`}
            onClick={() => onChange?.(i)}
            className="rounded-md p-1 transition-transform active:scale-90"
          >
            {star}
          </button>
        ) : (
          <span key={i}>{star}</span>
        );
      })}
    </div>
  );
}
