/** Profil fotoğrafı; yoksa görünen adın baş harfleriyle sarı-siyah rozet */
export default function Avatar({ name, url, size = 36 }: { name: string; url: string | null | undefined; size?: number }) {
  const initials =
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toLocaleUpperCase('tr-TR') ?? '')
      .join('') || '?';
  const box = { width: size, height: size };
  return url ? (
    <img src={url} alt="" style={box} className="shrink-0 rounded-full bg-card object-cover ring-2 ring-brand" />
  ) : (
    <span
      style={{ ...box, fontSize: Math.max(11, size * 0.38) }}
      className="inline-flex shrink-0 select-none items-center justify-center rounded-full bg-brand font-extrabold text-onbrand ring-2 ring-night"
      aria-hidden
    >
      {initials}
    </span>
  );
}
