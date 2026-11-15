import { useRef, useState, type ReactNode } from 'react';

export type SheetSnap = 'hidden' | 'peek' | 'half' | 'full';

interface Props {
  snap: SheetSnap;
  onSnapChange: (s: SheetSnap) => void;
  containerHeight: number;
  header: ReactNode;
  /** Panelin sol üst köşesinden dışarı taşan alan (ACİL butonu) */
  tab?: ReactNode;
  children: ReactNode;
}

export const PEEK_HEIGHT = 172;
const ORDER: Exclude<SheetSnap, 'hidden'>[] = ['peek', 'half', 'full'];

export function snapHeights(containerHeight: number) {
  return {
    hidden: 0,
    peek: PEEK_HEIGHT,
    half: Math.round(containerHeight * 0.52),
    full: Math.max(containerHeight - 76, PEEK_HEIGHT),
  } as const;
}

export default function BottomSheet({ snap, onSnapChange, containerHeight, header, tab, children }: Props) {
  const heights = snapHeights(containerHeight);
  const [dragHeight, setDragHeight] = useState<number | null>(null);
  const drag = useRef<{ y: number; h: number; t: number; moved: boolean } | null>(null);
  const height = dragHeight ?? heights[snap];

  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('[data-no-drag]')) return;
    drag.current = { y: e.clientY, h: heights[snap], t: performance.now(), moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dy = d.y - e.clientY;
    if (Math.abs(dy) > 4) d.moved = true;
    if (d.moved) setDragHeight(Math.min(Math.max(d.h + dy, 90), heights.full));
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    const current = snap === 'hidden' ? 'peek' : snap;
    if (!d.moved) {
      // Dokunma: bir sonraki seviyeye geç
      onSnapChange(current === 'full' ? 'peek' : ORDER[ORDER.indexOf(current) + 1]);
      return;
    }
    const dy = d.y - e.clientY;
    const h = d.h + dy;
    const velocity = dy / Math.max(performance.now() - d.t, 1); // px/ms, + yukarı
    let target: Exclude<SheetSnap, 'hidden'>;
    if (Math.abs(velocity) > 0.6) {
      const idx = ORDER.indexOf(current);
      target = velocity > 0 ? ORDER[Math.min(idx + 1, 2)] : ORDER[Math.max(idx - 1, 0)];
    } else {
      target = ORDER.reduce((best, s) => (Math.abs(heights[s] - h) < Math.abs(heights[best] - h) ? s : best), 'peek');
    }
    setDragHeight(null);
    onSnapChange(target);
  };

  return (
    <section
      aria-label="Yakındaki tuvaletler paneli"
      className={`absolute inset-x-0 bottom-0 z-30 flex flex-col rounded-t-[28px] bg-white shadow-sheet ${
        dragHeight === null ? 'transition-[height] duration-300 ease-[cubic-bezier(.2,.8,.2,1)]' : ''
      }`}
      style={{ height }}
    >
      {tab && snap !== 'hidden' && <div className="absolute -top-[60px] left-4">{tab}</div>}

      <div
        className="shrink-0 cursor-grab touch-none select-none active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div className="flex justify-center pb-1 pt-2.5">
          <span className="h-1.5 w-11 rounded-full bg-gray-300" />
        </div>
        {header}
      </div>

      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)]">
        {children}
      </div>
    </section>
  );
}
