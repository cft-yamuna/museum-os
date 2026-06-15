/**
 * WheelSegment — reusable SVG arc/pie segment.
 *
 * Draws an annular sector between `startAngle` and `endAngle`
 * (in degrees, 0 = 12 o'clock, clockwise) with inner and outer radii.
 */

interface WheelSegmentProps {
  /** Center x of the wheel */
  cx: number;
  /** Center y of the wheel */
  cy: number;
  /** Inner radius of this ring */
  innerRadius: number;
  /** Outer radius of this ring */
  outerRadius: number;
  /** Start angle in degrees (0 = top / 12 o'clock, clockwise) */
  startAngle: number;
  /** End angle in degrees */
  endAngle: number;
  /** Fill color */
  fill: string;
  /** Optional stroke */
  stroke?: string;
  strokeWidth?: number;
  /** Optional opacity */
  opacity?: number;
  /** Extra className for the path */
  className?: string;
  /** Click handler */
  onClick?: () => void;
  /** Children rendered inside the segment (labels, icons) — positioned at segment centroid */
  children?: React.ReactNode;
}

/** Convert degrees to radians, with 0° at 12 o'clock (top). */
function degToRad(deg: number): number {
  return ((deg - 90) * Math.PI) / 180;
}

/** Get a point on a circle at a given angle and radius from center. */
function polarToCartesian(cx: number, cy: number, radius: number, angleDeg: number) {
  const rad = degToRad(angleDeg);
  return {
    x: cx + radius * Math.cos(rad),
    y: cy + radius * Math.sin(rad),
  };
}

/** Build the SVG `d` attribute for an annular arc sector. */
export function describeArc(
  cx: number,
  cy: number,
  innerR: number,
  outerR: number,
  startAngle: number,
  endAngle: number,
): string {
  const outerStart = polarToCartesian(cx, cy, outerR, startAngle);
  const outerEnd = polarToCartesian(cx, cy, outerR, endAngle);
  const innerEnd = polarToCartesian(cx, cy, innerR, endAngle);
  const innerStart = polarToCartesian(cx, cy, innerR, startAngle);

  // Handle wraparound: normalize sweep to [0, 360]
  let sweep = endAngle - startAngle;
  if (sweep < 0) sweep += 360;
  const largeArc = sweep > 180 ? 1 : 0;

  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${outerR} ${outerR} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${innerR} ${innerR} 0 ${largeArc} 0 ${innerStart.x} ${innerStart.y}`,
    'Z',
  ].join(' ');
}

/** Get the centroid (center point) of an annular sector — for placing labels. */
export function getSegmentCentroid(
  cx: number,
  cy: number,
  innerR: number,
  outerR: number,
  startAngle: number,
  endAngle: number,
) {
  const midAngle = (startAngle + endAngle) / 2;
  const midR = (innerR + outerR) / 2;
  return polarToCartesian(cx, cy, midR, midAngle);
}

export default function WheelSegment({
  cx,
  cy,
  innerRadius,
  outerRadius,
  startAngle,
  endAngle,
  fill,
  stroke = 'none',
  strokeWidth = 1.5,
  opacity = 1,
  className,
  onClick,
  children,
}: WheelSegmentProps) {
  const d = describeArc(cx, cy, innerRadius, outerRadius, startAngle, endAngle);
  const centroid = getSegmentCentroid(cx, cy, innerRadius, outerRadius, startAngle, endAngle);
  const midAngle = (startAngle + endAngle) / 2;

  return (
    <g className={className} onClick={onClick} style={{ cursor: onClick ? 'pointer' : undefined }}>
      <path
        d={d}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
        opacity={opacity}
        style={{ transition: 'opacity 0.3s ease' }}
      />
      {children && (
        <g transform={`translate(${centroid.x}, ${centroid.y}) rotate(${midAngle})`}>
          {children}
        </g>
      )}
    </g>
  );
}
