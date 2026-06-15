/**
 * InnerWheel — the sector ring with 8 colored segments.
 * Each segment extends from innerRadius all the way through to renderOuterRadius
 * (the outer ring's outer edge) as ONE continuous shape — no seam at the ring boundary.
 * The gradient fades the color so beige shows through in the outer ring area.
 * An SVG mask cuts consistent-width transparent lanes between segments.
 */

import { describeArc } from './WheelSegment';

export interface InnerSegmentData {
  id: string;
  label: string;
  color: string;
}

interface InnerWheelProps {
  cx: number;
  cy: number;
  innerRadius: number;
  /** Original boundary where inner ring "ends" — used for label positioning */
  outerRadius: number;
  /** Actual geometry extends to this radius (outer ring outer edge) */
  renderOuterRadius: number;
  segments: InnerSegmentData[];
  angle: number;
  activeIndex: number;
}

// Fixed pixel width of the transparent gap between segments
const SEPARATOR_WIDTH = 5;

/** Convert degrees (0° = 12 o'clock, clockwise) to radians. */
function degToRad(deg: number): number {
  return ((deg - 90) * Math.PI) / 180;
}

export default function InnerWheel({
  cx,
  cy,
  innerRadius,
  outerRadius,
  renderOuterRadius,
  segments,
  angle,
  activeIndex,
}: InnerWheelProps) {
  const segmentAngle = 360 / segments.length;
  const halfSeg = segmentAngle / 2;

  // Gradient ratios relative to renderOuterRadius (the full extent)
  const innerEdge = innerRadius / renderOuterRadius;
  const outerEdge = outerRadius / renderOuterRadius;

  // Label centroid radius (midpoint of original inner ring area)
  const labelRadius = (innerRadius + outerRadius) / 2;

  return (
    <g transform={`rotate(${angle}, ${cx}, ${cy})`}>
      <defs>
        {/* Radial gradient per sector — active flows into outer ring, inactive cuts at boundary */}
        {segments.map((seg, i) => {
          const isActive = i === activeIndex;
          return (
            <radialGradient
              key={`grad-${i}`}
              id={`inner-seg-grad-${i}`}
              cx={cx}
              cy={cy}
              r={renderOuterRadius}
              gradientUnits="userSpaceOnUse"
            >
              {/* Transparent before the inner edge */}
              <stop offset="0%" stopColor={seg.color} stopOpacity={0} />
              <stop offset={`${innerEdge * 85}%`} stopColor={seg.color} stopOpacity={0} />
              {/* Solid color through the inner ring */}
              <stop offset={`${innerEdge * 100}%`} stopColor={seg.color} stopOpacity={0.9} />
              {isActive ? (
                <>
                  {/* Active: color flows into the outer ring with a smooth fade */}
                  <stop offset="60%" stopColor={seg.color} stopOpacity={0.9} />
                  <stop offset="85%" stopColor={seg.color} stopOpacity={0.15} />
                  <stop offset="100%" stopColor={seg.color} stopOpacity={0} />
                </>
              ) : (
                <>
                  {/* Inactive: opacity fades within the inner ring, then cuts at boundary */}
                  <stop offset={`${(innerEdge + outerEdge) / 2 * 100}%`} stopColor={seg.color} stopOpacity={0.55} />
                  <stop offset={`${outerEdge * 100 - 2}%`} stopColor={seg.color} stopOpacity={0.15} />
                  <stop offset={`${outerEdge * 100}%`} stopColor={seg.color} stopOpacity={0} />
                  <stop offset="100%" stopColor={seg.color} stopOpacity={0} />
                </>
              )}
            </radialGradient>
          );
        })}

        {/* Mask: white = visible, black lines = transparent gaps (only in inner ring area) */}
        <mask id="inner-wheel-gap-mask">
          {/* Full white background covering the entire extended area */}
          <rect
            x={cx - renderOuterRadius - 5} y={cy - renderOuterRadius - 5}
            width={renderOuterRadius * 2 + 10} height={renderOuterRadius * 2 + 10}
            fill="white"
          />
          {/* Black radial lines cut gaps — only in the inner ring area */}
          {segments.map((_, i) => {
            const boundaryAngle = i * segmentAngle + halfSeg;
            const rad = degToRad(boundaryAngle);
            const x1 = cx + (innerRadius - 4) * Math.cos(rad);
            const y1 = cy + (innerRadius - 4) * Math.sin(rad);
            const x2 = cx + (renderOuterRadius + 4) * Math.cos(rad);
            const y2 = cy + (renderOuterRadius + 4) * Math.sin(rad);

            return (
              <line
                key={`mask-${i}`}
                x1={x1} y1={y1}
                x2={x2} y2={y2}
                stroke="black"
                strokeWidth={SEPARATOR_WIDTH}
              />
            );
          })}
        </mask>
      </defs>

      {/* All segments — geometry extends to renderOuterRadius, mask cuts gaps in inner area only */}
      <g mask="url(#inner-wheel-gap-mask)">
        {segments.map((seg, i) => {
          const startAngle = i * segmentAngle - halfSeg;
          const endAngle = i * segmentAngle + halfSeg;
          const isActive = i === activeIndex;
          const d = describeArc(cx, cy, innerRadius, renderOuterRadius, startAngle, endAngle);

          return (
            <path
              key={seg.id}
              d={d}
              fill={`url(#inner-seg-grad-${i})`}
              opacity={isActive ? 1 : 0.85}
              stroke="none"
              style={{ transition: 'opacity 0.3s ease' }}
            />
          );
        })}
      </g>

      {/* Labels — positioned at original inner ring centroid, separate from geometry */}
      {segments.map((seg, i) => {
        const startAngle = i * segmentAngle - halfSeg;
        const endAngle = i * segmentAngle + halfSeg;
        const midAngle = (startAngle + endAngle) / 2;
        const rad = degToRad(midAngle);
        const lx = cx + labelRadius * Math.cos(rad);
        const ly = cy + labelRadius * Math.sin(rad);

        return (
          <g key={`label-${seg.id}`} transform={`translate(${lx}, ${ly})`}>
            {/* Counter-rotate so text reads upright */}
            <g transform={`rotate(${-angle})`}>
              {seg.label.split('\n').map((line, li, arr) => (
                <text
                  key={li}
                  x={0}
                  y={li * 14 - ((arr.length - 1) * 14) / 2}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill="rgba(0,0,0,0.8)"
                  fontSize={12}
                  fontFamily="'Segoe UI', system-ui, sans-serif"
                  fontWeight={700}
                  letterSpacing={0.5}
                >
                  {line}
                </text>
              ))}
            </g>
          </g>
        );
      })}
    </g>
  );
}
