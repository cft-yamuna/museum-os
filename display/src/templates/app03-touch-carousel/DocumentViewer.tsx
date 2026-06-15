import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import type { WheelEvent as ReactWheelEvent, TouchEvent as ReactTouchEvent } from 'react';
import type { PlaylistItem } from '@/lib/types';
import { renderAsteriskBold } from '@/lib/richText';

/**
 * DocumentViewer — Splitscreen document reader for C-AV03 and similar installations.
 *
 * Design flow (based on C-AV03 design reference):
 *
 * 1. HOMEPAGE: Two document cards side by side on 1920×1080 screen.
 *    Each shows the first page as a thumbnail with a caption below.
 *
 * 2. SELECTION: Tapped document gets a highlighted background for ~1.2s,
 *    then transitions to the reading view.
 *
 * 3. READING (Splitscreen):
 *    - Left (~58%): Scrollable zoomed-in page content (all pages stacked vertically).
 *    - Right (~42%): Full-page overview thumbnail with a red dashed viewport indicator,
 *      source label, document caption, and page counter.
 *    - Home button (top-left) returns to the homepage.
 *
 * Metadata per playlist item:
 *   - documentIndex (number): groups items into documents
 *   - documentCaption (string): caption shown below thumbnails
 *   - documentSourceLabel (string): source attribution shown above the overview thumbnail
 */

interface DocumentViewerProps {
  items: PlaylistItem[];
  backgroundColor: string;
  fit: 'cover' | 'contain';
  onActivity: () => void;
  homeTimeoutSec?: number;
}

interface DocumentGroup {
  documentIndex: number;
  pages: PlaylistItem[];
  caption: string;
  sourceLabel: string;
}

type ViewState = 'homepage' | 'selecting' | 'reading';

const MIN_ZOOM = 1;
const MAX_ZOOM = 3;
const VIEWPORT_EPSILON = 0.15;
const DOC_ZOOM_RESET_IDLE_MS = 30000;

function clampZoom(value: number): number {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, value));
}

function getTouchDistance(
  a: { clientX: number; clientY: number },
  b: { clientX: number; clientY: number }
): number {
  const dx = a.clientX - b.clientX;
  const dy = a.clientY - b.clientY;
  return Math.hypot(dx, dy);
}

function isClose(a: number, b: number, epsilon = VIEWPORT_EPSILON): boolean {
  return Math.abs(a - b) <= epsilon;
}

// ── Grouping logic ──

function groupIntoDocuments(items: PlaylistItem[]): DocumentGroup[] {
  const groups: Record<number, PlaylistItem[]> = {};
  const ungrouped: PlaylistItem[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const docIdx = item.metadata?.documentIndex as number | undefined;
    if (docIdx !== undefined && docIdx !== null) {
      if (!groups[docIdx]) groups[docIdx] = [];
      groups[docIdx].push(item);
    } else {
      ungrouped.push(item);
    }
  }

  const result: DocumentGroup[] = [];
  const keys = Object.keys(groups).map(Number).sort((a, b) => { return a - b; });

  for (let k = 0; k < keys.length; k++) {
    const pages = groups[keys[k]];
    const first = pages[0];
    result.push({
      documentIndex: keys[k],
      pages: pages,
      caption:
        (first.metadata?.documentCaption as string)
        || (first.metadata?.caption as string)
        || '',
      sourceLabel:
        (first.metadata?.documentSourceLabel as string)
        || (first.metadata?.sourceLabel as string)
        || '',
    });
  }

  for (let u = 0; u < ungrouped.length; u++) {
    const ug = ungrouped[u];
    result.push({
      documentIndex: result.length,
      pages: [ug],
      caption:
        (ug.metadata?.documentCaption as string)
        || (ug.metadata?.caption as string)
        || '',
      sourceLabel:
        (ug.metadata?.documentSourceLabel as string)
        || (ug.metadata?.sourceLabel as string)
        || '',
    });
  }

  return result;
}

function splitCaption(caption: string): { firstLine: string; remaining: string } {
  const normalized = (caption || '').replace(/\r\n/g, '\n').trim();
  if (!normalized) {
    return { firstLine: '', remaining: '' };
  }

  const lines = normalized
    .split('\n')
    .map((line) => { return line.trim(); })
    .filter((line) => { return line.length > 0; });

  if (lines.length === 0) {
    return { firstLine: '', remaining: '' };
  }

  return {
    firstLine: lines[0],
    remaining: lines.slice(1).join('\n'),
  };
}

// ── Component ──

function DocumentViewer(props: DocumentViewerProps) {
  const items = props.items;
  const backgroundColor = props.backgroundColor;
  const onActivity = props.onActivity;
  const homeIdleMs = Math.max(30, Number(props.homeTimeoutSec || 60)) * 1000;

  const documents = useMemo(() => { return groupIntoDocuments(items); }, [items]);

  const [viewState, setViewState] = useState<ViewState>('homepage');
  const [selectedDocIndex, setSelectedDocIndex] = useState(-1);
  const [activeDocIndex, setActiveDocIndex] = useState(0);
  const [pageIndex, setPageIndex] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [viewportRect, setViewportRect] = useState({ left: 0, top: 0, width: 100, height: 100 });
  const [overlayBox, setOverlayBox] = useState({ left: 0, top: 0, width: 0, height: 0, visible: false });

  const scrollRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef(1);
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);
  const selectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const overviewWrapRef = useRef<HTMLDivElement>(null);
  const overviewImgRef = useRef<HTMLImageElement>(null);
  const pinchStartDistanceRef = useRef(0);
  const isPinchingRef = useRef(false);
  const zoomFrameRef = useRef<number | null>(null);
  const viewportFrameRef = useRef<number | null>(null);
  const lastActivityAtRef = useRef(0);
  const lastHomeInteractionAtRef = useRef(Date.now());

  const currentDoc = documents[activeDocIndex] || documents[0];
  const totalPages = currentDoc ? currentDoc.pages.length : 0;

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  // Cleanup selection timer
  useEffect(() => {
    return () => {
      if (selectTimerRef.current) clearTimeout(selectTimerRef.current);
      if (zoomFrameRef.current !== null) cancelAnimationFrame(zoomFrameRef.current);
      if (viewportFrameRef.current !== null) cancelAnimationFrame(viewportFrameRef.current);
    };
  }, []);

  // ── Homepage → Selection → Reading ──

  const handleSelectDoc = useCallback((index: number) => {
    setSelectedDocIndex(index);
    setViewState('selecting');
    onActivity();

    selectTimerRef.current = setTimeout(() => {
      lastHomeInteractionAtRef.current = Date.now();
      setActiveDocIndex(index);
      setPageIndex(0);
      setZoom(1);
      setViewportRect({ left: 0, top: 0, width: 100, height: 100 });
      setOverlayBox({ left: 0, top: 0, width: 0, height: 0, visible: false });
      setViewState('reading');
    }, 1200);
  }, [onActivity]);

  const handleGoHome = useCallback(() => {
    setViewState('homepage');
    setSelectedDocIndex(-1);
    setPageIndex(0);
    setZoom(1);
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
      scrollRef.current.scrollLeft = 0;
    }
    onActivity();
  }, [onActivity]);

  const signalActivity = useCallback(() => {
    const now = Date.now();
    lastHomeInteractionAtRef.current = now;
    if (now - lastActivityAtRef.current < 120) return;
    lastActivityAtRef.current = now;
    onActivity();
  }, [onActivity]);

  const shouldBlockBrowserZoom = useCallback((target: EventTarget | null) => {
    if (viewState !== 'reading') return true;
    const panel = scrollRef.current;
    if (!panel || !(target instanceof Element) || !panel.contains(target)) return true;
    return !target.closest('img');
  }, [viewState]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const onWheelCapture = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      if (shouldBlockBrowserZoom(event.target)) {
        event.preventDefault();
      }
    };

    const onTouchCapture = (event: TouchEvent) => {
      if (event.touches.length < 2) return;
      if (shouldBlockBrowserZoom(event.target)) {
        event.preventDefault();
      }
    };

    root.addEventListener('wheel', onWheelCapture, { capture: true, passive: false });
    root.addEventListener('touchstart', onTouchCapture, { capture: true, passive: false });
    root.addEventListener('touchmove', onTouchCapture, { capture: true, passive: false });

    return () => {
      root.removeEventListener('wheel', onWheelCapture, true);
      root.removeEventListener('touchstart', onTouchCapture, true);
      root.removeEventListener('touchmove', onTouchCapture, true);
    };
  }, [shouldBlockBrowserZoom]);

  // ── Overlay box calculation (red dashed rect on the right-side thumbnail) ──

  const recalcOverlay = useCallback(() => {
    const img = overviewImgRef.current;
    const wrap = overviewWrapRef.current;
    if (!img || !wrap) {
      setOverlayBox((prev) => { return prev.visible ? { left: 0, top: 0, width: 0, height: 0, visible: false } : prev; });
      return;
    }

    const wrapRect = wrap.getBoundingClientRect();
    const imgRect = img.getBoundingClientRect();

    // If the image hasn't rendered yet
    if (imgRect.width === 0 || imgRect.height === 0) return;

    const relLeft = imgRect.left - wrapRect.left;
    const relTop = imgRect.top - wrapRect.top;

    const boxLeft = relLeft + (viewportRect.left / 100) * imgRect.width;
    const boxTop = relTop + (viewportRect.top / 100) * imgRect.height;
    const boxWidth = Math.max((viewportRect.width / 100) * imgRect.width, 4);
    const boxHeight = Math.max((viewportRect.height / 100) * imgRect.height, 4);

    setOverlayBox({
      left: boxLeft,
      top: boxTop,
      width: boxWidth,
      height: boxHeight,
      visible: true,
    });
  }, [viewportRect]);

  // Recalculate overlay when viewportRect or pageIndex changes
  useEffect(() => {
    if (viewState === 'reading') {
      recalcOverlay();
    }
  }, [viewState, viewportRect, pageIndex, recalcOverlay]);

  // ── Scroll tracking (left panel) ──

  const updateViewport = useCallback(() => {
    if (!scrollRef.current) return;
    const container = scrollRef.current;
    const containerTop = container.scrollTop;
    const containerLeft = container.scrollLeft;
    const containerBottom = containerTop + container.clientHeight;
    const containerRight = containerLeft + container.clientWidth;
    const containerMidY = containerTop + container.clientHeight / 2;

    // Find which page is most visible
    let bestPage = 0;
    let bestDist = Infinity;
    for (let i = 0; i < pageRefs.current.length; i++) {
      const el = pageRefs.current[i];
      if (!el) continue;
      const pageTop = el.offsetTop;
      const pageHeight = el.offsetHeight;
      const dist = Math.abs(pageTop + pageHeight / 2 - containerMidY);
      if (dist < bestDist) {
        bestDist = dist;
        bestPage = i;
      }
    }

    setPageIndex((prev) => { return prev === bestPage ? prev : bestPage; });

    // Calculate viewport rect relative to the current page
    const pageEl = pageRefs.current[bestPage];
    if (pageEl) {
      const pageTop = pageEl.offsetTop;
      const pageLeft = pageEl.offsetLeft;
      const pageHeight = pageEl.offsetHeight;
      const pageWidth = pageEl.offsetWidth;
      if (pageHeight > 0 && pageWidth > 0) {
        const visTop = Math.max(0, containerTop - pageTop);
        const visBot = Math.min(pageHeight, containerBottom - pageTop);
        const visLeft = Math.max(0, containerLeft - pageLeft);
        const visRight = Math.min(pageWidth, containerRight - pageLeft);
        const visibleWidth = Math.max(0, visRight - visLeft);
        const visibleHeight = Math.max(0, visBot - visTop);
        const nextRect = {
          left: (visLeft / pageWidth) * 100,
          top: (visTop / pageHeight) * 100,
          width: (visibleWidth / pageWidth) * 100,
          height: (visibleHeight / pageHeight) * 100,
        };
        setViewportRect((prev) => {
          if (
            isClose(prev.left, nextRect.left)
            && isClose(prev.top, nextRect.top)
            && isClose(prev.width, nextRect.width)
            && isClose(prev.height, nextRect.height)
          ) {
            return prev;
          }
          return nextRect;
        });
      }
    }
  }, []);

  const scheduleViewportUpdate = useCallback(() => {
    if (viewportFrameRef.current !== null) return;
    viewportFrameRef.current = requestAnimationFrame(() => {
      viewportFrameRef.current = null;
      updateViewport();
    });
  }, [updateViewport]);

  const applyZoomAtAnchor = useCallback(
    (nextZoomInput: number, anchor: { x: number; y: number }) => {
      const container = scrollRef.current;
      if (!container) return;

      const prevZoom = zoomRef.current;
      const prevScrollLeft = container.scrollLeft;
      const prevScrollTop = container.scrollTop;
      const nextZoom = clampZoom(nextZoomInput);

      if (Math.abs(nextZoom - prevZoom) < 0.004) return;

      const contentX = (prevScrollLeft + anchor.x) / prevZoom;
      const contentY = (prevScrollTop + anchor.y) / prevZoom;

      setZoom(nextZoom);

      requestAnimationFrame(() => {
        const current = scrollRef.current;
        if (!current) return;
        current.scrollLeft = contentX * nextZoom - anchor.x;
        current.scrollTop = contentY * nextZoom - anchor.y;
        scheduleViewportUpdate();
      });
    },
    [scheduleViewportUpdate]
  );

  const queueZoomAtAnchor = useCallback(
    (nextZoomInput: number, anchor: { x: number; y: number }) => {
      if (zoomFrameRef.current !== null) {
        cancelAnimationFrame(zoomFrameRef.current);
      }
      zoomFrameRef.current = requestAnimationFrame(() => {
        zoomFrameRef.current = null;
        applyZoomAtAnchor(nextZoomInput, anchor);
      });
    },
    [applyZoomAtAnchor]
  );

  const handleWheel = useCallback(
    (e: ReactWheelEvent<HTMLDivElement>) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      if (!(e.target instanceof Element) || !e.target.closest('img')) {
        signalActivity();
        return;
      }
      const container = scrollRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const factor = e.deltaY < 0 ? 1.08 : 0.92;
      queueZoomAtAnchor(zoomRef.current * factor, {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
      signalActivity();
    },
    [queueZoomAtAnchor, signalActivity]
  );

  const handleTouchStart = useCallback(
    (e: ReactTouchEvent<HTMLDivElement>) => {
      if (e.touches.length !== 2) return;
      if (!(e.target instanceof Element) || !e.target.closest('img')) {
        isPinchingRef.current = false;
        pinchStartDistanceRef.current = 0;
        signalActivity();
        return;
      }

      const t1 = e.touches[0];
      const t2 = e.touches[1];
      pinchStartDistanceRef.current = getTouchDistance(t1, t2);
      isPinchingRef.current = true;
      signalActivity();
    },
    [signalActivity]
  );

  const handleTouchMove = useCallback(
    (e: ReactTouchEvent<HTMLDivElement>) => {
      if (e.touches.length !== 2) return;
      if (!(e.target instanceof Element) || !e.target.closest('img')) {
        e.preventDefault();
        isPinchingRef.current = false;
        pinchStartDistanceRef.current = 0;
        signalActivity();
        return;
      }
      if (!isPinchingRef.current) return;
      e.preventDefault();
      const container = scrollRef.current;
      if (!container) return;

      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const distance = getTouchDistance(t1, t2);
      if (pinchStartDistanceRef.current <= 0) return;

      const rect = container.getBoundingClientRect();
      const anchor = {
        x: (t1.clientX + t2.clientX) / 2 - rect.left,
        y: (t1.clientY + t2.clientY) / 2 - rect.top,
      };
      const ratio = distance / pinchStartDistanceRef.current;
      queueZoomAtAnchor(zoomRef.current * ratio, anchor);
      pinchStartDistanceRef.current = distance;
      signalActivity();
    },
    [queueZoomAtAnchor, signalActivity]
  );

  const handleTouchEnd = useCallback(() => {
    if (!isPinchingRef.current) return;
    isPinchingRef.current = false;
    pinchStartDistanceRef.current = 0;
    if (zoomFrameRef.current !== null) {
      cancelAnimationFrame(zoomFrameRef.current);
      zoomFrameRef.current = null;
    }
    scheduleViewportUpdate();
  }, [scheduleViewportUpdate]);

  useEffect(() => {
    if (viewState !== 'reading') return;

    const intervalId = setInterval(() => {
      const now = Date.now();
      if (zoomRef.current <= MIN_ZOOM + 0.001) return;
      if (now - lastHomeInteractionAtRef.current < DOC_ZOOM_RESET_IDLE_MS) return;

      const container = scrollRef.current;
      if (!container) {
        setZoom(MIN_ZOOM);
        return;
      }

      applyZoomAtAnchor(MIN_ZOOM, {
        x: container.clientWidth / 2,
        y: container.clientHeight / 2,
      });
    }, 1000);

    return () => { clearInterval(intervalId); };
  }, [viewState, applyZoomAtAnchor]);

  useEffect(() => {
    if (viewState !== 'reading') return;

    const intervalId = setInterval(() => {
      if (Date.now() - lastHomeInteractionAtRef.current < homeIdleMs) return;
      handleGoHome();
    }, 1000);

    return () => { clearInterval(intervalId); };
  }, [viewState, homeIdleMs, handleGoHome]);

  // Initialize viewport when entering reading mode
  useEffect(() => {
    if (viewState === 'reading') {
      lastHomeInteractionAtRef.current = Date.now();
      pageRefs.current = [];
      setZoom(1);
      if (scrollRef.current) {
        scrollRef.current.scrollTop = 0;
        scrollRef.current.scrollLeft = 0;
      }
      const timer = setTimeout(scheduleViewportUpdate, 250);
      return () => { clearTimeout(timer); };
    }
  }, [viewState, activeDocIndex, scheduleViewportUpdate]);

  useEffect(() => {
    if (viewState !== 'reading') return;
    const id = requestAnimationFrame(scheduleViewportUpdate);
    return () => { cancelAnimationFrame(id); };
  }, [viewState, zoom, scheduleViewportUpdate]);

  useEffect(() => {
    if (viewState !== 'reading') return;
    const onResize = () => { scheduleViewportUpdate(); };
    window.addEventListener('resize', onResize);
    return () => { window.removeEventListener('resize', onResize); };
  }, [viewState, scheduleViewportUpdate]);

  const handleScroll = useCallback(() => {
    scheduleViewportUpdate();
    signalActivity();
  }, [scheduleViewportUpdate, signalActivity]);

  // ── Empty state ──

  if (!documents || documents.length === 0) {
    return (
      <div style={{
        width: '100%', height: '100%', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: backgroundColor, color: '#fff', opacity: 0.4,
      }}>
        No documents
      </div>
    );
  }

  // ════════════════════════════════════════════
  // HOMEPAGE / SELECTING
  // ════════════════════════════════════════════

  if (viewState === 'homepage' || viewState === 'selecting') {
    return (
      <div
        ref={rootRef}
        style={{
          width: '100%', height: '100%', backgroundColor: '#ffffff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: 48, padding: '48px 64px',
        }}
      >
        {documents.map((doc, i) => {
          const isSelected = viewState === 'selecting' && selectedDocIndex === i;
          const firstPage = doc.pages[0];
          const captionParts = splitCaption(doc.caption || '');
          const hasSecondaryText = !!captionParts.remaining;
          const firstLineWeight = hasSecondaryText && i !== 0 ? 600 : 400;

          return (
            <div
              key={doc.documentIndex}
              className="doc-card"
              onClick={() => { if (viewState === 'homepage') handleSelectDoc(i); }}
              style={{
                flex: '1 1 0',
                maxWidth: 820,
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 24,
                cursor: viewState === 'homepage' ? 'pointer' : 'default',
                backgroundColor: isSelected ? '#c3b47d' : 'transparent',
                borderRadius: 0,
                border: '1px solid #e7e7e7',
                padding: '28px 24px',
                transition: 'background-color 0.35s ease',
                boxShadow: 'none',
              }}
            >
              {/* Document thumbnail */}
              <div style={{
                flex: '1 1 0',
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
              }}>
                {firstPage && (
                  <img
                    src={firstPage.url}
                    alt={doc.caption || 'Document ' + (i + 1)}
                    draggable={false}
                    style={{
                      maxWidth: '100%',
                      maxHeight: '100%',
                      objectFit: 'contain',
                      boxShadow: 'none',
                    }}
                  />
                )}
              </div>

              {/* Bottom caption on each homepage card */}
              <div style={{ textAlign: 'center' }}>
                {doc.caption ? (
                  <div style={{
                    color: '#333',
                    fontSize: 16,
                    lineHeight: 1.35,
                    maxWidth: 500,
                    margin: '0 auto',
                    paddingLeft: 14,
                    paddingRight: 14,
                  }}>
                    <div style={{ fontWeight: firstLineWeight }}>
                      {renderAsteriskBold(captionParts.firstLine)}
                    </div>
                    {hasSecondaryText && (
                      <div style={{ marginTop: 4, fontWeight: 400, whiteSpace: 'pre-line' as const }}>
                        {renderAsteriskBold(captionParts.remaining)}
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ color: '#999', fontSize: 13 }}>
                    Document {i + 1}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // ════════════════════════════════════════════
  // READING VIEW (Splitscreen)
  // ════════════════════════════════════════════

  return (
    <div style={{
      width: '100%', height: '100%', backgroundColor: '#ffffff',
      display: 'flex', overflow: 'hidden',
    }}
    ref={rootRef}
    >
      {/* Hide scrollbar in WebKit browsers */}
      <style>{'\
        .doc-scroll-panel::-webkit-scrollbar { width: 8px; }\
        .doc-scroll-panel::-webkit-scrollbar-track { background: transparent; }\
        .doc-scroll-panel::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.15); border-radius: 4px; }\
        .doc-scroll-panel::-webkit-scrollbar-thumb:hover { background: rgba(0,0,0,0.25); }\
        .doc-home-btn:hover { background-color: rgba(0,0,0,0.65) !important; }\
      '}</style>

      {/* ── LEFT PANEL: Scrollable zoomed reader ── */}
      <div style={{
        flex: '1 1 0',
        height: '100%',
        position: 'relative',
        borderRight: '1px solid #e0e0e0',
      }}>
        {/* Home button */}
        <div
          className="doc-home-btn"
          onClick={handleGoHome}
          style={{
            position: 'absolute', top: 36, left: 36, zIndex: 30,
            width: 48, height: 48, borderRadius: 24,
            backgroundColor: 'rgba(0,0,0,0.50)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
            transition: 'background-color 200ms',
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
          }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path
              d="M3 12L5 10M5 10L12 3L19 10M5 10V20C5 20.55 5.45 21 6 21H9M19 10L21 12M19 10V20C19 20.55 18.55 21 18 21H15M9 21C9.55 21 10 20.55 10 20V16C10 15.45 10.45 15 11 15H13C13.55 15 14 15.45 14 16V20C14 20.55 14.45 21 15 21M9 21H15"
              stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            />
          </svg>
        </div>

        {/* Scrollable content — all pages stacked vertically */}
        <div
          ref={scrollRef}
          className="doc-scroll-panel"
          onScroll={handleScroll}
          onWheel={handleWheel}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd}
          style={{
            width: '100%',
            height: '100%',
            overflow: 'auto',
            touchAction: 'pan-x pan-y',
            overscrollBehavior: 'contain',
          }}
        >
          <div style={{ width: `${zoom * 100}%`, minWidth: '100%', willChange: 'width' }}>
            {currentDoc.pages.map((page, idx) => {
              return (
                <div
                  key={page.id + '-' + idx}
                  ref={(el) => { pageRefs.current[idx] = el; }}
                  style={{ width: '100%' }}
                >
                  {page.type === 'video' ? (
                    <video
                      src={page.url}
                      autoPlay
                      muted={false}
                      loop
                      playsInline
                      draggable={false}
                      style={{
                        width: '100%', height: 'auto', display: 'block',
                        pointerEvents: 'none',
                      }}
                    />
                  ) : (
                    <img
                      src={page.url}
                      alt={'Page ' + (idx + 1)}
                      draggable={false}
                      loading={idx > 1 ? 'lazy' : 'eager'}
                      onLoad={idx === 0 ? scheduleViewportUpdate : undefined}
                      style={{
                        width: '100%', height: 'auto', display: 'block',
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── RIGHT PANEL: Page overview + viewport indicator ── */}
      <div style={{
        width: 420,
        minWidth: 420,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '28px 24px',
        backgroundColor: '#f5f5f5',
      }}>
        {/* Source label (above the thumbnail) */}
        {currentDoc.sourceLabel && (
          <div style={{
            color: '#777',
            fontSize: 11,
            textAlign: 'center',
            lineHeight: 1.5,
            maxWidth: 360,
          }}>
            {renderAsteriskBold(currentDoc.sourceLabel)}
          </div>
        )}

        <div style={{
          width: '100%',
          flex: '1 1 0',
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'flex-start',
        }}>
          {/* Page overview thumbnail with red viewport box */}
          <div
            ref={overviewWrapRef}
            style={{
              width: '100%',
              maxHeight: currentDoc.caption ? 'calc(100% - 44px)' : '100%',
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
            }}
          >
            <img
              ref={overviewImgRef}
              src={currentDoc.pages[pageIndex]?.url || currentDoc.pages[0]?.url}
              alt={'Page ' + (pageIndex + 1) + ' overview'}
              draggable={false}
              onLoad={recalcOverlay}
              style={{
                maxWidth: '100%',
                maxHeight: '100%',
                objectFit: 'contain',
                display: 'block',
                border: '1px solid #d0d0d0',
              }}
            />

            {/* Red dashed viewport indicator */}
            {overlayBox.visible && (
              <div style={{
                position: 'absolute',
                left: overlayBox.left,
                top: overlayBox.top,
                width: overlayBox.width,
                height: overlayBox.height,
                border: '2px dashed rgba(200, 40, 60, 0.7)',
                backgroundColor: 'rgba(200, 40, 60, 0.04)',
                pointerEvents: 'none',
                transition: 'left 120ms ease-out, top 120ms ease-out, width 120ms ease-out, height 120ms ease-out',
                boxSizing: 'border-box',
              }} />
            )}
          </div>

          {/* Document caption directly below overview image */}
          {currentDoc.caption && (
            (() => {
              const captionParts = splitCaption(currentDoc.caption);
              const hasSecondaryText = !!captionParts.remaining;
              const firstLineWeight = hasSecondaryText && activeDocIndex !== 0 ? 600 : 400;
              return (
                <div style={{
                  marginTop: 10,
                  color: '#444',
                  fontSize: 14,
                  lineHeight: 1.35,
                  textAlign: 'center',
                  maxWidth: 370,
                  paddingLeft: 12,
                  paddingRight: 12,
                }}>
                  <div style={{ fontWeight: firstLineWeight }}>
                    {renderAsteriskBold(captionParts.firstLine)}
                  </div>
                  {hasSecondaryText && (
                    <div style={{ marginTop: 4, fontWeight: 400, whiteSpace: 'pre-line' as const }}>
                      {renderAsteriskBold(captionParts.remaining)}
                    </div>
                  )}
                </div>
              );
            })()
          )}
        </div>

        {/* Page counter */}
        <div style={{
          color: '#888',
          fontSize: 13,
          marginTop: 10,
        }}>
          Page {pageIndex + 1} of {totalPages}
        </div>
      </div>
    </div>
  );
}

export { DocumentViewer };
export type { DocumentViewerProps };
