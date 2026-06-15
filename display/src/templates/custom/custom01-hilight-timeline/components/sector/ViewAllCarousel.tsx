/**
 * ViewAllCarousel — arrows + labels for the View All carousel.
 * Dandelion rendering is handled by AmbientScene (persistent 7-dandelion architecture).
 */

import { useCallback, type CSSProperties } from 'react';
import { SECTOR_CONFIGS } from '../../data/sectors';
import { Sector } from '../../types';

const WINDOW_SIZE = 3;
const MIN_SIZE = 280;
const MAX_SIZE = 380;

// All sectors except ViewAll
export const CAROUSEL_SECTORS = SECTOR_CONFIGS.filter((s) => s.id !== Sector.ViewAll);
export const MAX_START_INDEX = Math.max(0, CAROUSEL_SECTORS.length - WINDOW_SIZE);

/** Deterministic hash-based size for each sector (consistent across re-renders). */
export function sectorSize(sectorId: string): number {
  let hash = 0;
  for (let i = 0; i < sectorId.length; i++) {
    hash = ((hash << 5) - hash + sectorId.charCodeAt(i)) | 0;
  }
  const normalized = (Math.abs(hash) % 1000) / 1000;
  return Math.round(MIN_SIZE + normalized * (MAX_SIZE - MIN_SIZE));
}

/** Pre-computed sizes for all carousel sectors. */
const _sizes: Record<string, number> = {};
for (const s of CAROUSEL_SECTORS) {
  _sizes[s.id] = sectorSize(s.id);
}
export const SECTOR_SIZES: Readonly<Record<string, number>> = Object.freeze(_sizes);

/** Y-center offset for ViewAll layout: bigger dandelions sit higher, smaller ones lower. */
export function sectorYCenter(sectorId: string): number {
  const size = SECTOR_SIZES[sectorId] ?? 330;
  // Biggest (380) → topOffset + size/2, smallest (280) → topOffset + size/2 + 80
  const drop = ((MAX_SIZE - size) / (MAX_SIZE - MIN_SIZE)) * 80;
  return 60 + size / 2 + drop;
}

const ARROW_SIZE = 64;

interface ViewAllCarouselProps {
  startIndex: number;
  onShift: (delta: -1 | 1) => void;
}

export default function ViewAllCarousel({ startIndex, onShift }: ViewAllCarouselProps) {
  const canGoLeft = startIndex > 0;
  const canGoRight = startIndex < MAX_START_INDEX;

  const handleLeft = useCallback(() => onShift(-1), [onShift]);
  const handleRight = useCallback(() => onShift(1), [onShift]);

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 25,
      }}
    >
      {/* Left arrow — vertically centered on screen (1920px) */}
      <ArrowButton
        direction="left"
        disabled={!canGoLeft}
        onClick={handleLeft}
        style={{
          position: 'absolute',
          left: 40,
          top: '50%',
          transform: 'translateY(-50%)',
          pointerEvents: 'auto',
        }}
      />

      {/* Right arrow — vertically centered on screen (1920px) */}
      <ArrowButton
        direction="right"
        disabled={!canGoRight}
        onClick={handleRight}
        style={{
          position: 'absolute',
          right: 40,
          top: '50%',
          transform: 'translateY(-50%)',
          pointerEvents: 'auto',
        }}
      />
    </div>
  );
}

// ─── Arrow Button ────────────────────────────────────────────────────

function ArrowButton({
  direction,
  disabled,
  onClick,
  style: positionStyle,
}: {
  direction: 'left' | 'right';
  disabled: boolean;
  onClick: () => void;
  style?: CSSProperties;
}) {
  const isLeft = direction === 'left';

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={isLeft ? 'Previous sector' : 'Next sector'}
      style={{
        width: ARROW_SIZE,
        height: ARROW_SIZE,
        borderRadius: '50%',
        border: '1.5px solid rgba(0,0,0,0.15)',
        background: disabled
          ? 'rgba(0,0,0,0.03)'
          : 'rgba(0,0,0,0.06)',
        cursor: disabled ? 'default' : 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.25 : 1,
        transition: 'all 0.25s ease',
        flexShrink: 0,
        ...positionStyle,
      }}
      onMouseEnter={(e) => {
        if (!disabled) {
          e.currentTarget.style.background = 'rgba(0,0,0,0.12)';
          e.currentTarget.style.borderColor = 'rgba(0,0,0,0.3)';
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = disabled
          ? 'rgba(0,0,0,0.03)'
          : 'rgba(0,0,0,0.06)';
        e.currentTarget.style.borderColor = 'rgba(0,0,0,0.15)';
      }}
    >
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="rgba(0,0,0,0.45)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ transform: isLeft ? undefined : 'rotate(180deg)' }}
      >
        <polyline points="15 18 9 12 15 6" />
      </svg>
    </button>
  );
}
