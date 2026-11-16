import { test } from 'node:test';
import assert from 'node:assert/strict';
import { distanceToRoute, placesOnRoute } from './corridor.ts';
import type { PlaceView } from '../types';

// Doğu-batı yönünde ~860 m'lik düz rota (İzmir enlemi)
const A = { lat: 38.43, lng: 27.13 };
const B = { lat: 38.43, lng: 27.14 };
const M_PER_DEG_LAT = 111_320;

test('point on the segment is ~0 m away', () => {
  assert.ok(distanceToRoute({ lat: 38.43, lng: 27.135 }, [A, B]) < 1);
});

test('perpendicular offset is measured to the segment, not the vertices', () => {
  const d = distanceToRoute({ lat: 38.43 + 100 / M_PER_DEG_LAT, lng: 27.135 }, [A, B]);
  assert.ok(Math.abs(d - 100) < 2, String(d));
});

test('beyond the segment end the distance is to the end point', () => {
  const d = distanceToRoute({ lat: 38.43, lng: 27.142 }, [A, B]);
  assert.ok(Math.abs(d - 174) < 3, String(d)); // 0.002° boylam ≈ 174 m
});

test('multi-segment route uses the nearest segment', () => {
  const C = { lat: 38.44, lng: 27.14 };
  const d = distanceToRoute({ lat: 38.435, lng: 27.14 + 50 / 87_200 }, [A, B, C]);
  assert.ok(Math.abs(d - 50) < 3, String(d));
});

const place = (id: string, lat: number, lng: number) => ({ id, lat, lng }) as PlaceView;

test('placesOnRoute: within 150 m only, target excluded', () => {
  const list = [
    place('yakin', 38.43 + 120 / M_PER_DEG_LAT, 27.137),
    place('uzak', 38.43 + 250 / M_PER_DEG_LAT, 27.137),
    place('hedef', 38.43, 27.14),
  ];
  assert.deepEqual([...placesOnRoute(list, [A, B], 'hedef')], ['yakin']);
});

test('empty or single-point route → nothing', () => {
  assert.equal(placesOnRoute([place('x', 38.43, 27.13)], [], 'h').size, 0);
  assert.equal(distanceToRoute(A, []), Infinity);
});
