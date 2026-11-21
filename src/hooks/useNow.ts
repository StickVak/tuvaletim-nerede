import { useEffect, useState } from 'react';

/** Saniyede bir yenilenen "şu an" (geri sayımlar için) */
export function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now()); // etkinleşir etkinleşmez güncel zamanla başla (eski değerle ilk kare yanlış görünmesin)
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [active]);
  /** Yeni bir bitiş zamanı ayarlanınca saati de hemen güncelle (sayaç bir an fazladan saniye göstermesin) */
  const sync = () => setNow(Date.now());
  return [now, sync] as const;
}
