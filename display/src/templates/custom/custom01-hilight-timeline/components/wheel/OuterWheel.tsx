/**
 * OuterWheel — the decade ring with 8 segments.
 * Neutral gray/dark tones with curved decade range labels.
 * Rotates independently of the inner wheel.
 * Color overlay is now handled by InnerWheel's extended geometry.
 */

import WheelSegment from './WheelSegment';

export interface OuterSegmentData {
  label: string;
  startYear: number;
  endYear: number;
}

interface OuterWheelProps {
  cx: number;
  cy: number;
  innerRadius: number;
  outerRadius: number;
  segments: OuterSegmentData[];
  angle: number;
  activeIndex: number;
}

/** Convert degrees (0° = 12 o'clock, clockwise) to radians. */
function degToRad(deg: number): number {
  return ((deg - 90) * Math.PI) / 180;
}

/**
 * Build an SVG arc path for textPath usage.
 * The arc goes clockwise from startAngle to endAngle at the given radius.
 */
function describeTextArc(
  cx: number,
  cy: number,
  radius: number,
  startAngle: number,
  endAngle: number,
): string {
  const startRad = degToRad(startAngle);
  const endRad = degToRad(endAngle);
  const x1 = cx + radius * Math.cos(startRad);
  const y1 = cy + radius * Math.sin(startRad);
  const x2 = cx + radius * Math.cos(endRad);
  const y2 = cy + radius * Math.sin(endRad);

  let sweep = endAngle - startAngle;
  if (sweep < 0) sweep += 360;
  const largeArc = sweep > 180 ? 1 : 0;

  return `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`;
}

export default function OuterWheel({
  cx,
  cy,
  innerRadius,
  outerRadius,
  segments,
  angle,
  activeIndex,
}: OuterWheelProps) {
  const segmentAngle = 360 / segments.length;
  const halfSeg = segmentAngle / 2;
  // Push text toward the outer edge of the ring (70% from inner to outer)
  const textRadius = innerRadius + (outerRadius - innerRadius) * 0.72;
  // Inset the text arc slightly from segment edges for padding
  const arcPadding = 4;

  return (
    <g transform={`rotate(${angle}, ${cx}, ${cy})`}>
      {/* Arc path definitions for curved text — offset by -halfSeg so centers align */}
      <defs>
        {segments.map((_, i) => {
          const startAngle = i * segmentAngle - halfSeg + arcPadding;
          const endAngle = i * segmentAngle + halfSeg - arcPadding;
          return (
            <path
              key={`arc-${i}`}
              id={`outer-arc-${i}`}
              d={describeTextArc(cx, cy, textRadius, startAngle, endAngle)}
              fill="none"
            />
          );
        })}
      </defs>

      {/* Segment fills — offset by -halfSeg so centers align with snap targets */}
      {segments.map((seg, i) => {
        const startAngle = i * segmentAngle - halfSeg;
        const endAngle = i * segmentAngle + halfSeg;

        return (
          <WheelSegment
            key={seg.label}
            cx={cx}
            cy={cy}
            innerRadius={innerRadius}
            outerRadius={outerRadius}
            startAngle={startAngle}
            endAngle={endAngle}
            fill="#d5d0c9"
            opacity={1}
            stroke="none"
            strokeWidth={0}
          />
        );
      })}

      {/* Curved arc separators at segment boundaries */}
      {segments.map((_, i) => {
        const gapCenter = i * segmentAngle + halfSeg;
        const gapStart = gapCenter - arcPadding - 1.5;
        const gapEnd = gapCenter + arcPadding + 1.5;
        return (
          <path
            key={`gap-${i}`}
            d={describeTextArc(cx, cy, textRadius, gapStart, gapEnd)}
            fill="none"
            stroke="rgba(0,0,0,0.45)"
            strokeWidth={2.5}
          />
        );
      })}

      {/* Curved decade labels using textPath */}
      {segments.map((seg, i) => {
        const isActive = i === activeIndex;
        return (
          <text
            key={`label-${i}`}
            fill={isActive ? 'rgba(0,0,0,0.95)' : 'rgba(0,0,0,0.85)'}
            fontSize={16}
            fontFamily="'Segoe UI', system-ui, sans-serif"
            fontWeight={isActive ? 800 : 700}
            letterSpacing={2}
          >
            <textPath
              href={`#outer-arc-${i}`}
              startOffset="50%"
              textAnchor="middle"
              dominantBaseline="central"
            >
              {seg.label}
            </textPath>
          </text>
        );
      })}
    </g>
  );
}
