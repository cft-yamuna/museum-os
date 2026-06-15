import { forwardRef, useRef } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import type { TimelineMilestone } from '../../types';
import OrganicRing from '../shared/OrganicRing';

export const CIRCLE_SIZE = 96;
/** Must match the scroll container padding in SectorTimeline */
const SCROLL_PADDING = 60;
/** Entry content width = canvas width minus both paddings */
const ENTRY_WIDTH = 1080 - 2 * SCROLL_PADDING;
/** Background inset keeps it hidden behind the organic ring edges */
const BG_INSET = 4;
/** Keep 13% empty margin on the right side of text area */
const RIGHT_EMPTY_MARGIN_RATIO = 0.13;

interface TimelineEntryProps {
  milestone: TimelineMilestone;
  color: string;
  isFocused?: boolean;
  /** When provided, positions the circle at this canvas X coordinate (on the sector stem). */
  stemXCenter?: number;
  /** Supports range labels in two lines, e.g. "1947\n1948". */
  yearText?: string;
  /** Supports grouped descriptions for year ranges. */
  descriptions?: string[];
}

const TimelineEntry = forwardRef<HTMLDivElement, TimelineEntryProps>(
  function TimelineEntry(
    {
      milestone,
      color,
      isFocused = false,
      stemXCenter,
      yearText = String(milestone.year),
      descriptions = [milestone.description],
    },
    ref,
  ) {
    const yearRingRef = useRef<SVGSVGElement>(null);
    const yearTweenRef = useRef<gsap.core.Tween | null>(null);

    // Desynchronized rotation: each entry spins at a different speed/phase based on year
    useGSAP(() => {
      yearTweenRef.current?.kill();

      if (yearRingRef.current) {
        const startRotation = (milestone.year * 137) % 360;
        const duration = 10 + (milestone.year % 7); // 10-16s per revolution
        gsap.set(yearRingRef.current, { rotation: startRotation, transformOrigin: '50% 50%' });
        yearTweenRef.current = gsap.to(yearRingRef.current, {
          rotation: startRotation + 360,
          duration,
          ease: 'none',
          repeat: -1,
          transformOrigin: '50% 50%',
        });
      }

      return () => {
        yearTweenRef.current?.kill();
      };
    }, [milestone.year]);

    // Position relative to the entry left edge (entry starts at SCROLL_PADDING in canvas coords)
    const localX = stemXCenter != null ? stemXCenter - SCROLL_PADDING : undefined;
    const circleLeft = localX != null ? `${localX}px` : '50%';
    // Content goes right if circle is in left 60% of canvas, otherwise left
    const contentOnRight = stemXCenter == null || stemXCenter <= 650;
    const originX = localX != null ? `${localX}px` : '50%';
    const textStartX = (localX ?? 0) + CIRCLE_SIZE / 2 + 28;
    const rightSideAvailable = Math.max(0, ENTRY_WIDTH - textStartX);
    const emptyRightReserve = rightSideAvailable * RIGHT_EMPTY_MARGIN_RATIO;
    const yearLineCount = yearText.split('\n').length;
    const yearFontSize = 18;
    const yearLineHeight = yearLineCount >= 3 ? 0.95 : 1;
    const pointSpacing = descriptions.length >= 2 ? 14 : 8;

    return (
      <div
        ref={ref}
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'flex-start',
          width: '100%',
          minHeight: 96,
          marginBottom: 54,
        }}
      >
        {/* Inner wrapper handles focus scale/dim (separate from GSAP stagger on outer div) */}
        <div
          style={{
            position: 'relative',
            width: '100%',
            transform: `scale(${isFocused ? 1 : 0.8})`,
            opacity: isFocused ? 1 : 0.8,
            transition: 'transform 0.4s ease, opacity 0.4s ease',
            transformOrigin: `${originX} ${CIRCLE_SIZE / 2}px`,
          }}
        >
          {/* Year circle: organic ring with white-filled center */}
          <div
            style={{
              position: 'absolute',
              left: circleLeft,
              top: 0,
              transform: 'translateX(-50%)',
              width: CIRCLE_SIZE,
              height: CIRCLE_SIZE,
              zIndex: 10,
            }}
          >
            {/* Opaque background disc matches page bg so the stem line hides behind it */}
            <div
              style={{
                position: 'absolute',
                inset: BG_INSET,
                borderRadius: '50%',
                background: '#d1cece',
                boxShadow: isFocused ? `0 0 20px ${color}88` : `0 0 14px ${color}55`,
                transition: 'box-shadow 0.35s ease',
              }}
            />
            {/* Organic ring SVG */}
            <OrganicRing
              ref={yearRingRef}
              size={CIRCLE_SIZE}
              color={color}
              style={{ position: 'absolute', inset: 0 }}
            />
            {/* Year text */}
            <span
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: "'Arial Black', 'Helvetica Neue', Arial, sans-serif",
                fontSize: yearFontSize,
                fontWeight: 900,
                color: '#2a2a2a',
                letterSpacing: '-0.02em',
                textAlign: 'center',
                whiteSpace: 'pre-line',
                lineHeight: yearLineHeight,
              }}
            >
              {yearText}
            </span>
          </div>

          {/* Content positioned relative to the circle and vertically centered */}
          {stemXCenter != null ? (
            <div
              style={{
                position: 'absolute',
                top: 0,
                minHeight: CIRCLE_SIZE,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                ...(contentOnRight
                  ? { left: textStartX, right: emptyRightReserve }
                  : { right: (ENTRY_WIDTH - (localX ?? 0)) + CIRCLE_SIZE / 2 + 28 }),
                textAlign: contentOnRight ? 'left' : 'right',
                minWidth: 0,
              }}
            >
              {descriptions.map((description, index) => (
                <p
                  key={`${milestone.id}-desc-${index}`}
                  style={{
                    fontFamily: "'Georgia', 'Times New Roman', serif",
                    fontSize: 13,
                    fontWeight: 400,
                    color: '#2a2a2a',
                    margin: 0,
                    marginBottom: index === descriptions.length - 1 ? 0 : pointSpacing,
                    lineHeight: 1.5,
                    letterSpacing: '0.01em',
                    whiteSpace: 'pre-line',
                  }}
                >
                  {description}
                </p>
              ))}
            </div>
          ) : (
            <div
              style={{
                marginLeft: 'calc(50% + 76px)',
                marginRight: '13%',
                minHeight: CIRCLE_SIZE,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                textAlign: 'left',
              }}
            >
              {descriptions.map((description, index) => (
                <p
                  key={`${milestone.id}-fallback-desc-${index}`}
                  style={{
                    fontFamily: "'Georgia', 'Times New Roman', serif",
                    fontSize: 13,
                    fontWeight: 400,
                    color: '#2a2a2a',
                    margin: 0,
                    marginBottom: index === descriptions.length - 1 ? 0 : pointSpacing,
                    lineHeight: 1.5,
                    letterSpacing: '0.01em',
                    whiteSpace: 'pre-line',
                  }}
                >
                  {description}
                </p>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  },
);

export default TimelineEntry;
