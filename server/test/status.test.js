import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeStatus, STATUS_WINDOW_MS } from '../status.js';

const NOW = Date.parse('2026-11-16T12:00:00Z');
const r = (user_id, report_type, minutesAgo) => ({ user_id, report_type, created_at: new Date(NOW - minutesAgo * 60000).toISOString() });

test('closed needs 2 distinct users within 3 hours', () => {
  assert.equal(computeStatus([r(1, 'closed', 10)], NOW).closed, false);
  assert.equal(computeStatus([r(1, 'closed', 10), r(1, 'closed', 20)], NOW).closed, false);
  assert.equal(computeStatus([r(1, 'closed', 10), r(2, 'closed', 170)], NOW).closed, true);
});

test('reports older than 3 hours are ignored', () => {
  assert.equal(STATUS_WINDOW_MS, 3 * 60 * 60 * 1000);
  const s = computeStatus([r(1, 'closed', 10), r(2, 'closed', 181), r(3, 'no_supplies', 200)], NOW);
  assert.equal(s.closed, false);
  assert.equal(s.noSupplies, 0);
});

test('no_supplies and crowded count distinct recent reporters', () => {
  const s = computeStatus([r(1, 'no_supplies', 5), r(2, 'no_supplies', 5), r(2, 'no_supplies', 50), r(3, 'crowded', 1)], NOW);
  assert.deepEqual(s, { closed: false, closedReports: 0, noSupplies: 2, crowded: 1 });
});
