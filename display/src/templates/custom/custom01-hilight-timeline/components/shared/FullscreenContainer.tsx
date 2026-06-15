import { useRef, useState, useCallback, useEffect, type ReactNode } from 'react';

const CANVAS_W = 1080;
const CANVAS_H = 1920;

interface FullscreenContainerProps {
  children: ReactNode;
}

export default function FullscreenContainer({ children }: FullscreenContainerProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  const recalc = useCallback(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    setScale(Math.min(vw / CANVAS_W, vh / CANVAS_H));
  }, []);

  useEffect(() => {
    recalc();
    window.addEventListener('resize', recalc);
    return () => window.removeEventListener('resize', recalc);
  }, [recalc]);

  return (
    <div
      ref={wrapperRef}
      style={{
        width: '100vw',
        height: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        background: '#d2cdc5',
      }}
    >
      <div
        style={{
          width: CANVAS_W,
          height: CANVAS_H,
          position: 'relative',
          overflow: 'hidden',
          transform: `scale(${scale})`,
          transformOrigin: 'center center',
          flexShrink: 0,
        }}
      >
        {children}
      </div>
    </div>
  );
}
