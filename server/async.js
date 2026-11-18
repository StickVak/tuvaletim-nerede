import { Router } from 'express';

/** Express 4 async işleyicilerin hatalarını yakalamaz: reddedilen Promise'leri hata işleyicisine (next) iletir */
const wrap = (fn) =>
  typeof fn !== 'function' || fn.length === 4
    ? fn
    : function wrapped(req, res, next) {
        try {
          const p = fn(req, res, next);
          if (p && typeof p.then === 'function') p.catch(next);
        } catch (e) {
          next(e);
        }
      };

/** Router ile aynı; get/post/put/patch/delete/use/all'a verilen async işleyiciler güvenle sarılır */
export function asyncRouter() {
  const r = Router();
  for (const m of ['get', 'post', 'put', 'patch', 'delete', 'use', 'all']) {
    const orig = r[m].bind(r);
    r[m] = (...args) => orig(...args.map(wrap));
  }
  return r;
}
