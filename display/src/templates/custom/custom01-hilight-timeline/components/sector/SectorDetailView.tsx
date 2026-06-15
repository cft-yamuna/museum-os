import { useRef, useMemo } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import SectorTimeline from './SectorTimeline';
import type { SectorConfig } from '../../types';

interface SectorDetailViewProps {
  sector: SectorConfig;
  dandelionSize: number;
  /** Optional decade year range for filtering milestones */
  decadeRange?: { startYear: number; endYear: number } | null;
  /** Decade to start at when switching sectors (e.g. "1945") */
  initialDecade?: string | null;
  /** Called when visible decade changes */
  onDecadeChange?: (decade: string) => void;
}

export default function SectorDetailView({
  sector,
  dandelionSize,
  decadeRange = null,
  initialDecade = null,
  onDecadeChange,
}: SectorDetailViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    const el = containerRef.current;
    if (!el) return;

    gsap.fromTo(el,
      { opacity: 0 },
      { opacity: 1, duration: 0.8, delay: 0.5, ease: 'power2.out' },
    );
  }, { scope: containerRef });

  const timelineProps = useMemo(() => ({ dandelionSize }), [dandelionSize]);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 20,
        opacity: 0,
        pointerEvents: 'auto',
      }}
    >
      <SectorTimeline
        sector={sector}
        dandelionSize={timelineProps.dandelionSize}
        decadeRange={decadeRange}
        initialDecade={initialDecade}
        onDecadeChange={onDecadeChange}
      />
    </div>
  );
}
