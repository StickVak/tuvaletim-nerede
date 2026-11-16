/** "az önce", "5 dk önce", "3 gün önce" ya da tarih */
export function relTime(iso: string): string {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'az önce';
  if (m < 60) return `${m} dk önce`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} sa önce`;
  const d = Math.round(h / 24);
  return d < 30 ? `${d} gün önce` : new Date(iso).toLocaleDateString('tr-TR');
}

/** "Kasım 2026" */
export const joinedLabel = (iso: string) => new Date(iso).toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' });
