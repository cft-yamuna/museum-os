import { useRef, useMemo, useEffect, useLayoutEffect } from 'react';
import gsap from 'gsap';
import TimelineEntry from './TimelineEntry';
import { useTimelineData } from '../../context/TimelineDataContext';
import { ANIMATION } from '../../constants/animation';
import { Sector } from '../../types';
import type { SectorConfig } from '../../types';
import type { TimelineMilestone } from '../../types';
import { SECTOR_CONFIGS } from '../../data/sectors';

const SCROLL_PADDING = 60;

export interface StemConfig {
  xCenter: number;
  color: string;
  sectorId?: string;
  topY?: number;
}

interface SectorTimelineProps {
  sector: SectorConfig;
  dandelionSize: number;
  decadeRange?: { startYear: number; endYear: number } | null;
  stems?: StemConfig[];
  visibleSectorIds?: string[];
  overrideCenterY?: number;
  initialDecade?: string | null;
  onDecadeChange?: (decade: string) => void;
}

interface RenderMilestoneGroup {
  id: string;
  milestone: TimelineMilestone;
  yearText: string;
  descriptions: string[];
  decade: string;
}

function toRangeYearText(yearLabel: string): string {
  const normalized = yearLabel.replace(/\s+/g, '');
  const [startRaw, endRaw] = normalized.split('-');
  if (!startRaw || !endRaw) return yearLabel;
  const end = startRaw.length === 4 && endRaw.length === 2
    ? `${startRaw.slice(0, 2)}${endRaw}`
    : endRaw;
  return `${startRaw}\n-\n${end}`;
}

export default function SectorTimeline({
  sector,
  dandelionSize,
  decadeRange = null,
  stems,
  visibleSectorIds,
  overrideCenterY,
  initialDecade = null,
  onDecadeChange,
}: SectorTimelineProps) {
  const { data } = useTimelineData();
  const lineRefs = useRef<(HTMLDivElement | null)[]>([]);
  const contentRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const isViewAll = sector.id === Sector.ViewAll;

  const sectorColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const d of data.dandelions) map[d.sector.id] = d.sector.color;
    for (const s of SECTOR_CONFIGS) { if (!map[s.id]) map[s.id] = s.color; }
    return map;
  }, [data.dandelions]);

  const filteredMilestones = useMemo(
    () =>
      data.milestones
        .filter((m) => {
          const sectorMatch = visibleSectorIds
            ? visibleSectorIds.includes(m.sectorId)
            : (isViewAll || m.sectorId === sector.id);
          const decadeMatch = !decadeRange || (m.year >= decadeRange.startYear && m.year < decadeRange.endYear);
          return sectorMatch && decadeMatch;
        })
        .sort((a, b) => a.year - b.year),
    [data.milestones, sector.id, isViewAll, decadeRange, visibleSectorIds],
  );

  const renderMilestones = useMemo<RenderMilestoneGroup[]>(() => {
    const grouped: RenderMilestoneGroup[] = [];
    const groupsByDisplayKey = new Map<string, RenderMilestoneGroup>();

    for (const milestone of filteredMilestones) {
      const label = milestone.yearLabel?.trim();
      const displayKey = label || String(milestone.year);
      const yearText = label
        ? (label.includes('-') ? toRangeYearText(label) : label)
        : String(milestone.year);
      const key = `${milestone.sectorId}::${displayKey}`;
      const existing = groupsByDisplayKey.get(key);

      if (existing) {
        existing.descriptions.push(milestone.description);
        continue;
      }

      const group: RenderMilestoneGroup = {
        id: `${milestone.id}-group`,
        milestone,
        yearText,
        descriptions: [milestone.description],
        decade: milestone.decade,
      };
      groupsByDisplayKey.set(key, group);
      grouped.push(group);
    }

    return grouped;
  }, [filteredMilestones]);

  const dandelionCenterY = overrideCenterY ??
    (ANIMATION.sectorTransition.dandelionMove.targetY + dandelionSize / 2);

  const effectiveStems: StemConfig[] = useMemo(
    () => stems ?? [{ xCenter: 540, color: sector.color }],
    [stems, sector.color],
  );

  const stemBySector = useMemo(() => {
    const map: Record<string, StemConfig> = {};
    for (const stem of effectiveStems) {
      if (stem.sectorId) map[stem.sectorId] = stem;
    }
    return map;
  }, [effectiveStems]);

  const entryRefs = useRef<(HTMLDivElement | null)[]>([]);
  const animTlRef = useRef<gsap.core.Timeline | null>(null);
  // Middle 60% interactive zone — top 20% and bottom 20% are non-interactive
  const CANVAS_H = 1920;
  const ZONE_TOP = Math.round(CANVAS_H * 0.2);    // 384px
  const ZONE_BOTTOM = Math.round(CANVAS_H * 0.2);  // 384px
  const BOTTOM_FADE_HEIGHT = 220;
  const STEM_EXTRA_LIFT_RATIO = 0.1;
  const CONTENT_EXTRA_LIFT_RATIO = 0.12;
  const CONTENT_BOTTOM_STRONG_FADE_HEIGHT = 120;
  const contentBottomFadeOffset = BOTTOM_FADE_HEIGHT + Math.round(CANVAS_H * CONTENT_EXTRA_LIFT_RATIO);
  const stemBottomOffset = BOTTOM_FADE_HEIGHT + Math.round(CANVAS_H * STEM_EXTRA_LIFT_RATIO);
  // Extra tail space so the final milestone can settle above the heavy bottom fade.
  const END_STOP_SPACER = Math.max(270, contentBottomFadeOffset - 130);
  // Top fade: dandelion bottom edge is ~46px into container, fully opaque by +100px (half radius)
  const dandelionBottomEdge = dandelionCenterY + dandelionSize / 2 - ZONE_TOP;
  const fadeInEnd = dandelionBottomEdge + dandelionSize / 4; // 50% of radius below the edge
  const maskGradient = `linear-gradient(to bottom, transparent ${dandelionBottomEdge}px, black ${fadeInEnd}px, black calc(100% - ${contentBottomFadeOffset}px), rgba(0, 0, 0, 0.25) calc(100% - ${CONTENT_BOTTOM_STRONG_FADE_HEIGHT}px), transparent 100%)`;
  const stemBottomMask = `linear-gradient(to bottom, black 0%, black calc(100% - ${stemBottomOffset}px), transparent 100%)`;

  // Hide entries + stem immediately on sector change (before browser paints)
  useLayoutEffect(() => {
    const validLines = lineRefs.current.filter(Boolean);
    const validEntries = entryRefs.current.filter(Boolean);
    if (validLines.length > 0) gsap.set(validLines, { scaleY: 0, transformOrigin: 'top center' });
    if (validEntries.length > 0) gsap.set(validEntries, { opacity: 0, y: 0 });

    // Reset scroll and disable overflow clipping during animation
    const container = contentRef.current;
    if (container) {
      container.scrollTop = 0;
      container.style.overflowY = 'auto';
      container.style.overflowX = 'hidden';
      container.style.maskImage = 'none';
      container.style.webkitMaskImage = 'none';
    }
  }, [sector.id]);

  // Animate: dandelion centers → stem grows → entries slide up one by one from the bottom
  useEffect(() => {
    animTlRef.current?.revert();

    // Wait for dandelion to finish centering (0.8s) before stem starts
    const startDelay = ANIMATION.sectorTransition.dandelionMove.duration;

    const frameId = requestAnimationFrame(() => {
      const validLines = lineRefs.current.filter(Boolean);
      const validEntries = entryRefs.current.filter(Boolean);
      const container = contentRef.current;

      const tl = gsap.timeline({ delay: startDelay });
      animTlRef.current = tl;

      // 1. Stem grows from dandelion center to bottom
      if (validLines.length > 0) {
        tl.to(validLines, {
          scaleY: 1,
          duration: 1.2,
          ease: 'power1.out',
        });
      }

      // 2. After stem finishes, entries appear one by one from the bottom of the screen
      //    Each entry starts far below and slides up to its natural position
      if (validEntries.length > 0) {
        // Set all entries below the visible area
        gsap.set(validEntries, { opacity: 0, y: 1200 });

        // Enable scrolling as soon as entries start appearing (not after all finish)
        tl.call(() => {
          if (container) {
            container.style.overflow = '';
            container.style.overflowY = 'auto';
            container.style.overflowX = 'hidden';
            container.style.maskImage = maskGradient;
            container.style.webkitMaskImage = maskGradient;
          }
        }, [], '>');

        tl.to(validEntries, {
          opacity: 1,
          y: 0,
          duration: 2.4,
          stagger: 0.4,
          ease: 'power2.out',
        }, '<');
      }
    });

    return () => {
      cancelAnimationFrame(frameId);
      animTlRef.current?.revert();
    };
  }, [sector.id]);

  // Scroll to initialDecade milestone ONLY when sector changes (not on every decade update)
  const initialDecadeRef = useRef(initialDecade);
  initialDecadeRef.current = initialDecade;
  const prevSectorRef = useRef(sector.id);

  useEffect(() => {
    if (prevSectorRef.current === sector.id) return;
    prevSectorRef.current = sector.id;

    const decade = initialDecadeRef.current;
    if (!decade || !contentRef.current) return;

    // Defer to next frame so DOM has rendered
    requestAnimationFrame(() => {
      const container = contentRef.current;
      if (!container) return;
      const idx = renderMilestones.findIndex((m) => m.decade === decade);
      if (idx <= 0) return;
      const entryEls = container.querySelectorAll('[data-milestone]');
      const target = entryEls[idx] as HTMLElement | undefined;
      if (target) {
        // Use manual scrollTop instead of scrollIntoView to avoid
        // shifting ancestor containers (which causes the entire viewport to move up).
        const paddingTop = parseFloat(getComputedStyle(container).paddingTop) || 0;
        container.scrollTop = target.offsetTop - paddingTop;
      }
    });
  }, [sector.id, renderMilestones]);

  // Report current decade based on scroll position
  useEffect(() => {
    const el = contentRef.current;
    if (!el || !onDecadeChange) return;

    const handleScroll = () => {
      const viewportCenter = el.scrollTop + el.clientHeight / 3;
      const entries = el.querySelectorAll('[data-milestone]');
      let closestDecade = '';
      let closestDist = Infinity;
      entries.forEach((entry) => {
        const htmlEntry = entry as HTMLElement;
        const dist = Math.abs(htmlEntry.offsetTop - viewportCenter);
        if (dist < closestDist) {
          closestDist = dist;
          closestDecade = htmlEntry.dataset.decade ?? '';
        }
      });
      if (closestDecade) onDecadeChange(closestDecade);
    };

    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, [onDecadeChange, sector.id]);

  // ── Pull-to-edge overscroll: works with both touch and mouse wheel ──
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    let touchStartY = 0;
    let isOverscrolling = false;
    let overscrollOffset = 0;
    let slideBackRaf = 0;

    const isAtTop = () => el.scrollTop <= 0;
    const isAtBottom = () => el.scrollTop + el.clientHeight >= el.scrollHeight - 1;

    const animateBack = () => {
      cancelAnimationFrame(slideBackRaf);
      const step = () => {
        overscrollOffset *= 0.85; // ease back toward 0
        if (Math.abs(overscrollOffset) < 0.5) {
          overscrollOffset = 0;
          el.style.transform = '';
          return;
        }
        el.style.transform = `translateY(${overscrollOffset}px)`;
        slideBackRaf = requestAnimationFrame(step);
      };
      slideBackRaf = requestAnimationFrame(step);
    };

    // ── Touch ──
    const onTouchStart = (e: TouchEvent) => {
      touchStartY = e.touches[0].clientY;
      isOverscrolling = false;
      cancelAnimationFrame(slideBackRaf);
    };

    const onTouchMove = (e: TouchEvent) => {
      const dy = e.touches[0].clientY - touchStartY;
      const pullingDown = dy > 0 && isAtTop();
      const pullingUp = dy < 0 && isAtBottom();

      if (pullingDown || pullingUp) {
        isOverscrolling = true;
        const sign = dy > 0 ? 1 : -1;
        overscrollOffset = sign * Math.sqrt(Math.abs(dy)) * 4;
        el.style.transform = `translateY(${overscrollOffset}px)`;
      } else if (isOverscrolling) {
        isOverscrolling = false;
        animateBack();
      }
    };

    const onTouchEnd = () => {
      if (isOverscrolling) {
        isOverscrolling = false;
        animateBack();
      }
    };

    // ── Mouse wheel ──
    const onWheel = (e: WheelEvent) => {
      const scrollingDown = e.deltaY > 0;
      const scrollingUp = e.deltaY < 0;

      if ((scrollingUp && isAtTop()) || (scrollingDown && isAtBottom())) {
        // Accumulate overscroll offset with resistance
        const sign = scrollingUp ? 1 : -1;
        overscrollOffset += sign * Math.min(Math.abs(e.deltaY) * 0.3, 8);
        // Clamp max overscroll
        overscrollOffset = Math.max(-60, Math.min(60, overscrollOffset));
        el.style.transform = `translateY(${overscrollOffset}px)`;

        // Auto slide back after scrolling stops
        cancelAnimationFrame(slideBackRaf);
        slideBackRaf = requestAnimationFrame(() => {
          // Wait a tick, then start easing back
          slideBackRaf = requestAnimationFrame(() => animateBack());
        });
      }
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: true });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    el.addEventListener('wheel', onWheel, { passive: true });

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('wheel', onWheel);
      cancelAnimationFrame(slideBackRaf);
      el.style.transform = '';
    };
  }, [sector.id]);

  return (
    <div ref={wrapperRef} style={{ position: 'absolute', inset: 0 }}>
      {/* Vertical stem */}
      {effectiveStems.map((stem, si) => (
        <div
          key={si}
          ref={(el) => { lineRefs.current[si] = el; }}
          style={{
            position: 'absolute',
            left: stem.xCenter,
            top: stem.topY ?? dandelionCenterY,
            bottom: stemBottomOffset,
            width: 3,
            marginLeft: -1.5,
            background: `linear-gradient(180deg, #ffffff 0%, #ffffff66 72%, #ffffff22 88%, transparent 100%)`,
            opacity: 0.5,
            zIndex: 2,
            maskImage: stemBottomMask,
            WebkitMaskImage: stemBottomMask,
          }}
        />
      ))}

      {/* All milestones — constrained to middle 60% interactive zone */}
      <div
        ref={contentRef}
        style={{
          position: 'absolute',
          top: ZONE_TOP,
          left: 0,
          right: 0,
          bottom: ZONE_BOTTOM,
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: `${dandelionCenterY + dandelionSize / 2 + 20 - ZONE_TOP}px ${SCROLL_PADDING}px 0`,
          zIndex: 20,
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          touchAction: 'pan-y',
          WebkitOverflowScrolling: 'touch',
          maskImage: maskGradient,
          WebkitMaskImage: maskGradient,
        }}
      >
        {renderMilestones.map((group, i) => {
          const milestone = group.milestone;
          const stem = stemBySector[milestone.sectorId];
          return (
            <div
              key={group.id}
              ref={(el) => { entryRefs.current[i] = el; }}
              data-milestone
              data-decade={group.decade}
            >
              <TimelineEntry
                milestone={milestone}
                yearText={group.yearText}
                descriptions={group.descriptions}
                color={sectorColorMap[milestone.sectorId] ?? sector.color}
                isFocused={true}
                stemXCenter={stem?.xCenter}
              />
            </div>
          );
        })}

        <div style={{ height: END_STOP_SPACER, flexShrink: 0 }} />
      </div>
    </div>
  );
}
