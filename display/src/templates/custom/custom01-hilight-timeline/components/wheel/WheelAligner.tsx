/**
 * WheelAligner — triangle indicator fixed at 12 o'clock.
 * Points downward into the wheel to indicate the active segment.
 */

interface WheelAlignerProps {
  /** Center x of the wheel */
  cx: number;
  /** Y position for the tip of the aligner (just above the outer ring) */
  tipY: number;
  /** Width of the triangle base */
  width?: number;
  /** Height of the triangle */
  height?: number;
}

export default function WheelAligner({ cx, tipY, width = 28, height = 32 }: WheelAlignerProps) {
  const halfW = width / 2;

  // Triangle: base at top, tip pointing down into the wheel
  const points = [
    `${cx - halfW},${tipY - height}`,
    `${cx + halfW},${tipY - height}`,
    `${cx},${tipY}`,
  ].join(' ');

  return (
    <g>
      <defs>
        <linearGradient id="aligner-gradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#333333" stopOpacity={0.95} />
          <stop offset="100%" stopColor="#1a1a1a" stopOpacity={0.9} />
        </linearGradient>
        <filter id="aligner-shadow">
          <feDropShadow dx="0" dy="1" stdDeviation="2" floodColor="rgba(0,0,0,0.3)" />
        </filter>
      </defs>

      <polygon
        points={points}
        fill="url(#aligner-gradient)"
        filter="url(#aligner-shadow)"
        stroke="rgba(0,0,0,0.15)"
        strokeWidth={1}
      />
    </g>
  );
}
