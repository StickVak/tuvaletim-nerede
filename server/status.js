export const STATUS_WINDOW_MS = 3 * 60 * 60 * 1000;
/** open: "şu an açık / sorun yok" — kendisinden önceki kapalı bildirimlerini geçersiz kılar */
export const REPORT_TYPES = ['closed', 'no_supplies', 'crowded', 'open'];

/** Son 3 saatteki bildirimlerden canlı durum. "Kapalı" için son "açık" bildiriminden sonra en az 2 farklı kullanıcı gerekir. */
export function computeStatus(reports, now = Date.now()) {
  const recent = reports.filter((r) => now - Date.parse(r.created_at) <= STATUS_WINDOW_MS);
  const lastOpen = Math.max(-Infinity, ...recent.filter((r) => r.report_type === 'open').map((r) => Date.parse(r.created_at)));
  const users = (type, after = -Infinity) =>
    new Set(recent.filter((r) => r.report_type === type && Date.parse(r.created_at) > after).map((r) => r.user_id)).size;
  const closedReports = users('closed', lastOpen);
  return { closed: closedReports >= 2, closedReports, noSupplies: users('no_supplies'), crowded: users('crowded') };
}
