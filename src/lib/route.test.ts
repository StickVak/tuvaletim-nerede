import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { fetchWalkingRoute, WALK_SPEED_MPS } from './route.ts';

const A = { lat: 38.4189, lng: 27.1287 };
const B = { lat: 38.4351, lng: 27.1442 };
const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const osrm = (distance: number, duration: number) =>
  new Response(JSON.stringify({ code: 'Ok', routes: [{ distance, duration, geometry: { coordinates: [[27.1287, 38.4189], [27.135, 38.425], [27.1442, 38.4351]] } }] }));

test('uses the OSRM foot server first: street geometry, its distance and duration', async () => {
  const urls: string[] = [];
  globalThis.fetch = (async (u: string) => (urls.push(u), osrm(2470, 1974))) as typeof fetch;
  const r = await fetchWalkingRoute(A, B);
  assert.equal(urls.length, 1);
  assert.match(urls[0], /routing\.openstreetmap\.de\/routed-foot\/route\/v1\/foot\/27\.1287,38\.4189;27\.1442,38\.4351/);
  assert.equal(r.approximate, false);
  assert.equal(r.distance, 2470);
  assert.equal(r.duration, 1974);
  assert.equal(r.points.length, 5); // başlangıç + 3 sokak noktası + hedef
});

test('falls back to router.project-osrm.org; walking time recomputed from distance (demo server is car-only)', async () => {
  const urls: string[] = [];
  globalThis.fetch = (async (u: string) => {
    urls.push(u);
    if (u.includes('openstreetmap.de')) throw new Error('down');
    return osrm(3059, 300); // araç süresi
  }) as typeof fetch;
  const r = await fetchWalkingRoute(A, B);
  assert.match(urls[1], /router\.project-osrm\.org\/route\/v1\/foot\//);
  assert.equal(r.approximate, false);
  assert.equal(r.distance, 3059);
  assert.equal(r.duration, Math.round(3059 / WALK_SPEED_MPS));
});

test('both servers fail → straight dashed fallback with haversine distance', async () => {
  globalThis.fetch = (async () => new Response('err', { status: 503 })) as typeof fetch;
  const r = await fetchWalkingRoute(A, B);
  assert.equal(r.approximate, true);
  assert.deepEqual(r.points, [A, B]);
  assert.ok(r.distance > 2200 && r.distance < 2400, String(r.distance));
  assert.equal(r.duration, Math.round(r.distance / WALK_SPEED_MPS));
});
