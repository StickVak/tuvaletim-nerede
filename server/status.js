export const STATUS_WINDOW_MS = 3 * 60 * 60 * 1000;
export const REPORT_TYPES = ['closed', 'no_supplies', 'crowded'];

/** Son 3 saatteki bildirimlerden canlı durum. "Kapalı" için en az 2 farklı kullanıcı gerekir. */
export function computeStatus(reports, now = Date.now()) {
  const users = { closed: new Set(), no_supplies: new Set(), crowded: new Set() };
  for (const r of reports) {
    if (now - Date.parse(r.created_at) <= STATUS_WINDOW_MS && users[r.report_type]) users[r.report_type].add(r.user_id);
  }
  return {
    closed: users.closed.size >= 2,
    closedReports: users.closed.size,
    noSupplies: users.no_supplies.size,
    crowded: users.crowded.size,
  };
}
