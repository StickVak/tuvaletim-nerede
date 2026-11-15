import { useEffect, useState, type RefObject } from 'react';

export function useElementHeight(ref: RefObject<HTMLElement>) {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setHeight(el.clientHeight);
    const ro = new ResizeObserver(() => setHeight(el.clientHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return height;
}
