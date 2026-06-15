import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useAppShell } from '@/components/core/AppShell';
import { IdleScreen } from '@/components/core/IdleScreen';
import { TouchScroller } from '@/components/interactive/TouchScroller';
import { usePlaylist } from '@/hooks/usePlaylist';
import { useIdleTimer } from '@/hooks/useIdleTimer';
import { useHeartbeat } from '@/hooks/useHeartbeat';
import { useContentUpdates } from '@/hooks/useContentUpdates';
import { fetchWithTimeout } from '@/lib/api';
import { config } from '@/lib/config';
import { renderAsteriskBold } from '@/lib/richText';
import type { TouchScrollConfig, PlaylistItem } from '@/lib/types';

// ==========================================
// Types
// ==========================================

interface ScrollSection {
  id: string;
  type: 'text' | 'image' | 'video' | 'heading';
  content: string;
  caption?: string;
  style?: Record<string, string>;
}

interface PlaylistDocument {
  id: string;
  label: string;
  caption?: string;
  sourceLabel?: string;
  thumbnailUrl: string;
  pages: ScrollSection[];
  isTranslation: boolean;
  translationForDocumentId?: string;
  hasTranslation: boolean;
  translationDocumentId?: string;
}

interface TouchScrollTemplateProps {
  config: TouchScrollConfig;
  instanceId: string;
}

const CARD_OPEN_DELAY_MS = 420;
const TRANSLATION_CHOOSER_HOME_TIMEOUT_MS = 30000;
const DOC_ZOOM_RESET_IDLE_TIMEOUT_MS = 30000;
const DOC_OPEN_AUTO_SCROLL_DELAY_MS = 3000;

function normalizeInactivityTimeoutMs(timeout: number | undefined): number {
  if (!Number.isFinite(timeout)) return 30000;
  const raw = Number(timeout);
  if (raw <= 0) return 30000;
  // Admin UI uses seconds for this field; legacy/display configs often store ms.
  // Treat small values as seconds so `30` behaves as 30 seconds, not 30 ms.
  if (raw <= 300) return raw * 1000;
  return raw;
}

function playlistItemToSection(item: PlaylistItem, index: number): ScrollSection {
  return {
    id: item.id || String(index),
    type: item.type === 'video' ? 'video' : 'image',
    content: item.url,
    caption: undefined,
  };
}

function getDocumentGroups(items: PlaylistItem[]): PlaylistDocument[] {
  const grouped = new Map<string, PlaylistItem[]>();
  let hasExplicitDocumentIndex = false;

  items.forEach((item) => {
    const rawIndex = item.metadata?.documentIndex;
    let key: string;
    if (rawIndex === undefined || rawIndex === null || rawIndex === '') {
      key = '__default__';
    } else {
      hasExplicitDocumentIndex = true;
      key = String(rawIndex);
    }
    const list = grouped.get(key) || [];
    list.push(item);
    grouped.set(key, list);
  });

  if (!hasExplicitDocumentIndex) return [];

  const orderedKeys = Array.from(grouped.keys()).sort((a, b) => {
    if (a === '__default__') return 1;
    if (b === '__default__') return -1;
    const numA = Number(a);
    const numB = Number(b);
    if (!Number.isNaN(numA) && !Number.isNaN(numB)) return numA - numB;
    return a.localeCompare(b);
  });

  return orderedKeys.map((key, idx) => {
    const pages = grouped.get(key) || [];
    const first = pages[0];
    const sectionPages = pages.map(playlistItemToSection);
    const firstImage = pages.find((page) => { return page.type !== 'video'; });
    const metadata = (first?.metadata || {}) as Record<string, unknown>;
    const rawTranslationFor = metadata.translationForDocumentIndex;
    const rawTranslationDocument = metadata.translationDocumentIndex;
    const rawLabel = metadata.documentLabel;

    return {
      id: key,
      label: (typeof rawLabel === 'string' && rawLabel.trim().length > 0)
        ? rawLabel
        : `Document ${idx + 1}`,
      caption: (first?.metadata?.documentCaption as string) || (first?.metadata?.caption as string) || '',
      sourceLabel: (first?.metadata?.documentSourceLabel as string) || '',
      thumbnailUrl: firstImage?.url || first?.url || '',
      pages: sectionPages,
      isTranslation: Boolean(metadata.isTranslationDocument),
      translationForDocumentId: rawTranslationFor === undefined ? undefined : String(rawTranslationFor),
      hasTranslation: Boolean(metadata.documentHasTranslation),
      translationDocumentId: rawTranslationDocument === undefined ? undefined : String(rawTranslationDocument),
    };
  }).filter((doc) => { return doc.pages.length > 0; });
}

// ==========================================
// TouchScrollTemplate
// ==========================================

function TouchScrollTemplate(props: TouchScrollTemplateProps) {
  useAppShell();
  const scrollConfig = props.config;
  const normalizedFit = scrollConfig.fit === 'cover' || scrollConfig.fit === 'contain'
    ? scrollConfig.fit
    : 'contain';

  // Determine content mode: playlist-based or legacy contentUrl
  const usePlaylistMode = Boolean(scrollConfig.playlistId);

  // Legacy content URL mode
  const contentUrlTuple = useState<ScrollSection[]>([]);
  const urlContent = contentUrlTuple[0];
  const setUrlContent = contentUrlTuple[1];
  const urlLoadingTuple = useState(!usePlaylistMode);
  const urlLoading = urlLoadingTuple[0];
  const setUrlLoading = urlLoadingTuple[1];
  const urlErrorTuple = useState<string | null>(null);
  const urlError = urlErrorTuple[0];
  const setUrlError = urlErrorTuple[1];

  // Playlist mode
  const playlist = usePlaylist({
    playlistId: scrollConfig.playlistId || '',
    defaultDuration: 0, // not used for scroll
    shuffle: false,
    loop: false,
    enabled: usePlaylistMode,
    autoAdvance: false, // no auto-advance in scroll mode
  });

  const playlistSections = useMemo(() => {
    if (!usePlaylistMode) return [];
    return playlist.items.map((item, i) => {
      return {
        id: item.id || String(i),
        type: item.type === 'video' ? 'video' : 'image',
        content: item.url,
        caption: undefined,
      } as ScrollSection;
    });
  }, [usePlaylistMode, playlist.items]);

  const playlistDocuments = useMemo(() => {
    if (!usePlaylistMode) return [];
    return getDocumentGroups(playlist.items);
  }, [usePlaylistMode, playlist.items]);

  const documentById = useMemo(() => {
    return new Map(playlistDocuments.map((doc) => {
      return [doc.id, doc] as const;
    }));
  }, [playlistDocuments]);

  const rootDocuments = useMemo(() => {
    return playlistDocuments.filter((doc) => { return !doc.isTranslation; });
  }, [playlistDocuments]);

  const supportsDocumentHome = usePlaylistMode && rootDocuments.length >= 2;
  const activeDocumentIdTuple = useState<string | null>(null);
  const activeDocumentId = activeDocumentIdTuple[0];
  const setActiveDocumentId = activeDocumentIdTuple[1];
  const chooserDocumentIdTuple = useState<string | null>(null);
  const chooserDocumentId = chooserDocumentIdTuple[0];
  const setChooserDocumentId = chooserDocumentIdTuple[1];
  const jumpToSectionIdTuple = useState<string | null>(null);
  const jumpToSectionId = jumpToSectionIdTuple[0];
  const setJumpToSectionId = jumpToSectionIdTuple[1];
  const currentSectionIdTuple = useState<string | null>(null);
  const currentSectionId = currentSectionIdTuple[0];
  const setCurrentSectionId = currentSectionIdTuple[1];
  const suppressIdleCloseUntilRef = useRef(0);
  const lastCardSelectionRef = useRef<{ id: string; at: number } | null>(null);
  const cardOpenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingOpenDocIdTuple = useState<string | null>(null);
  const pendingOpenDocId = pendingOpenDocIdTuple[0];
  const setPendingOpenDocId = pendingOpenDocIdTuple[1];
  const thumbnailAspectRatiosTuple = useState<Record<string, number>>({});
  const thumbnailAspectRatios = thumbnailAspectRatiosTuple[0];
  const setThumbnailAspectRatios = thumbnailAspectRatiosTuple[1];
  const autoScrollWrapCountRef = useRef(0);
  const isDocumentZoomedTuple = useState(false);
  const isDocumentZoomed = isDocumentZoomedTuple[0];
  const setIsDocumentZoomed = isDocumentZoomedTuple[1];
  const documentAutoScrollDisabledTuple = useState(false);
  const documentAutoScrollDisabled = documentAutoScrollDisabledTuple[0];
  const setDocumentAutoScrollDisabled = documentAutoScrollDisabledTuple[1];
  const isDocumentZoomedRef = useRef(false);
  const zoomResetRequestIdTuple = useState(0);
  const zoomResetRequestId = zoomResetRequestIdTuple[0];
  const setZoomResetRequestId = zoomResetRequestIdTuple[1];
  const documentIdleStageTuple = useState<0 | 1>(0);
  const documentIdleStage = documentIdleStageTuple[0];
  const setDocumentIdleStage = documentIdleStageTuple[1];
  const inactivityTimeoutMs = useMemo(() => {
    return normalizeInactivityTimeoutMs(scrollConfig.inactivityTimeout);
  }, [scrollConfig.inactivityTimeout]);

  const activeDocument = useMemo(() => {
    if (!supportsDocumentHome || !activeDocumentId) return null;
    return documentById.get(activeDocumentId) || null;
  }, [supportsDocumentHome, activeDocumentId, documentById]);

  const chooserDocument = useMemo(() => {
    if (!supportsDocumentHome || !chooserDocumentId) return null;
    return documentById.get(chooserDocumentId) || null;
  }, [supportsDocumentHome, chooserDocumentId, documentById]);

  const shouldAutoScroll = supportsDocumentHome && Boolean(activeDocument)
    ? true
    : Boolean(scrollConfig.autoScroll);
  const autoScrollActive = shouldAutoScroll
    && !(
      supportsDocumentHome
      && Boolean(activeDocument)
      && (isDocumentZoomed || documentAutoScrollDisabled)
    );
  const documentIdleTimeoutActive = supportsDocumentHome && Boolean(activeDocument);
  const autoReturnHomeByWraps = supportsDocumentHome
    && Boolean(activeDocument)
    && autoScrollActive
    && !documentIdleTimeoutActive;
  const chooserHomeTimeoutActive = supportsDocumentHome && chooserDocumentId !== null;
  const effectiveInactivityTimeoutMs = chooserHomeTimeoutActive
    ? TRANSLATION_CHOOSER_HOME_TIMEOUT_MS
    : (documentIdleTimeoutActive ? DOC_ZOOM_RESET_IDLE_TIMEOUT_MS : inactivityTimeoutMs);

  const idle = useIdleTimer({
    enabled: Boolean((scrollConfig.idle && scrollConfig.idle.url) || scrollConfig.resetToFirstFrame || supportsDocumentHome),
    inactivityTimeout: effectiveInactivityTimeoutMs,
    hasContent: usePlaylistMode ? playlist.items.length > 0 : urlContent.length > 0,
    hasContentError: usePlaylistMode ? Boolean(playlist.error) : urlError !== null,
  });

  const { setStatus } = useHeartbeat({
    deviceId: config().deviceId,
    templateType: 'touch-scroll',
    instanceId: props.instanceId,
  });

  // Legacy: fetch content from URL
  const loadUrlContent = useCallback(
    async () => {
      if (usePlaylistMode || !scrollConfig.contentUrl) return;
      try {
        setUrlLoading(true);
        setUrlError(null);
        const response = await fetchWithTimeout(
          scrollConfig.contentUrl,
          { method: 'GET', headers: { 'Content-Type': 'application/json' } },
          10000
        );
        if (!response.ok) {
          throw new Error('Failed to fetch content: ' + response.status);
        }
        const data = await response.json();
        if (Array.isArray(data)) {
          setUrlContent(data);
        } else {
          throw new Error('Invalid content format');
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load content';
        setUrlError(message);
      } finally {
        setUrlLoading(false);
      }
    },
    [scrollConfig.contentUrl, usePlaylistMode]
  );

  useEffect(() => {
    if (!usePlaylistMode) loadUrlContent();
  }, [loadUrlContent, usePlaylistMode]);

  useEffect(() => {
    return () => {
      if (cardOpenTimerRef.current) {
        clearTimeout(cardOpenTimerRef.current);
        cardOpenTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!supportsDocumentHome) {
      if (activeDocumentId !== null) setActiveDocumentId(null);
      if (chooserDocumentId !== null) setChooserDocumentId(null);
      if (jumpToSectionId !== null) setJumpToSectionId(null);
      if (currentSectionId !== null) setCurrentSectionId(null);
      if (pendingOpenDocId !== null) setPendingOpenDocId(null);
      if (cardOpenTimerRef.current) {
        clearTimeout(cardOpenTimerRef.current);
        cardOpenTimerRef.current = null;
      }
      return;
    }

    if (activeDocumentId && !documentById.has(activeDocumentId)) {
      setActiveDocumentId(null);
      setJumpToSectionId(null);
    }
    if (chooserDocumentId && !documentById.has(chooserDocumentId)) {
      setChooserDocumentId(null);
    }
  }, [
    supportsDocumentHome,
    documentById,
    activeDocumentId,
    chooserDocumentId,
    jumpToSectionId,
    currentSectionId,
    pendingOpenDocId,
  ]);

  useEffect(() => {
    if (!supportsDocumentHome || !activeDocumentId) return;
    const doc = documentById.get(activeDocumentId);
    const firstPage = doc?.pages[0];
    setJumpToSectionId(firstPage ? firstPage.id : null);
    setCurrentSectionId(firstPage ? firstPage.id : null);
  }, [supportsDocumentHome, activeDocumentId, documentById]);

  useEffect(() => {
    if (!supportsDocumentHome || !idle.isIdle) return;
    if (Date.now() < suppressIdleCloseUntilRef.current) return;
    if (activeDocumentId !== null && idle.idleReason === 'inactivity') {
      if (documentIdleStage === 0) {
        if (isDocumentZoomedRef.current) {
          setZoomResetRequestId((prev) => { return prev + 1; });
        }
        setDocumentIdleStage(1);
        suppressIdleCloseUntilRef.current = Date.now() + 700;
        idle.activate();
        idle.resetInactivityTimer();
        return;
      }
      setDocumentIdleStage(0);
    }
    if (activeDocumentId !== null) {
      setActiveDocumentId(null);
      setJumpToSectionId(null);
    }
    if (chooserDocumentId !== null) {
      setChooserDocumentId(null);
    }
  }, [
    supportsDocumentHome,
    idle.isIdle,
    idle.idleReason,
    activeDocumentId,
    chooserDocumentId,
    documentIdleStage,
    idle.activate,
    idle.resetInactivityTimer,
  ]);

  useEffect(() => {
    autoScrollWrapCountRef.current = 0;
  }, [activeDocumentId, chooserDocumentId, supportsDocumentHome]);

  useEffect(() => {
    if (activeDocumentId === null || !supportsDocumentHome) {
      isDocumentZoomedRef.current = false;
      setIsDocumentZoomed(false);
      setDocumentAutoScrollDisabled(false);
      setDocumentIdleStage(0);
    }
  }, [activeDocumentId, supportsDocumentHome, setIsDocumentZoomed, setDocumentAutoScrollDisabled, setDocumentIdleStage]);

  const openDocument = useCallback((docId: string) => {
    if (cardOpenTimerRef.current) {
      clearTimeout(cardOpenTimerRef.current);
      cardOpenTimerRef.current = null;
    }
    setPendingOpenDocId(null);
    suppressIdleCloseUntilRef.current = Date.now() + 700;
    idle.activate();
    const doc = documentById.get(docId);
    if (!doc) return;

    const hasLinkedTranslation = Boolean(
      doc.hasTranslation
      && doc.translationDocumentId
      && documentById.get(doc.translationDocumentId)
    );

    if (hasLinkedTranslation) {
      setDocumentAutoScrollDisabled(false);
      setDocumentIdleStage(0);
      setChooserDocumentId(doc.id);
      setActiveDocumentId(null);
      setJumpToSectionId(null);
      setCurrentSectionId(null);
      idle.resetInactivityTimer();
      return;
    }

    const firstPage = doc.pages[0];
    setDocumentAutoScrollDisabled(false);
    setDocumentIdleStage(0);
    setChooserDocumentId(null);
    setActiveDocumentId(docId);
    setJumpToSectionId(firstPage ? firstPage.id : null);
    setCurrentSectionId(firstPage ? firstPage.id : null);
    idle.resetInactivityTimer();
  }, [documentById, idle.activate, idle.resetInactivityTimer, setDocumentAutoScrollDisabled, setDocumentIdleStage]);

  const openDocumentVariant = useCallback((docId: string) => {
    if (cardOpenTimerRef.current) {
      clearTimeout(cardOpenTimerRef.current);
      cardOpenTimerRef.current = null;
    }
    setPendingOpenDocId(null);
    suppressIdleCloseUntilRef.current = Date.now() + 700;
    idle.activate();
    const doc = documentById.get(docId);
    if (!doc) return;
    const firstPage = doc.pages[0];
    setDocumentAutoScrollDisabled(false);
    setDocumentIdleStage(0);
    setActiveDocumentId(docId);
    setJumpToSectionId(firstPage ? firstPage.id : null);
    setCurrentSectionId(firstPage ? firstPage.id : null);
    setChooserDocumentId(null);
    idle.resetInactivityTimer();
  }, [documentById, idle.activate, idle.resetInactivityTimer, setDocumentAutoScrollDisabled, setDocumentIdleStage]);

  const goHome = useCallback(() => {
    if (cardOpenTimerRef.current) {
      clearTimeout(cardOpenTimerRef.current);
      cardOpenTimerRef.current = null;
    }
    setPendingOpenDocId(null);
    suppressIdleCloseUntilRef.current = Date.now() + 700;
    idle.activate();
    setDocumentAutoScrollDisabled(false);
    setDocumentIdleStage(0);
    setActiveDocumentId(null);
    setChooserDocumentId(null);
    setJumpToSectionId(null);
    setCurrentSectionId(null);
    idle.resetInactivityTimer();
  }, [idle.activate, idle.resetInactivityTimer, setDocumentAutoScrollDisabled, setDocumentIdleStage]);

  const goBack = useCallback(() => {
    if (cardOpenTimerRef.current) {
      clearTimeout(cardOpenTimerRef.current);
      cardOpenTimerRef.current = null;
    }
    setPendingOpenDocId(null);
    suppressIdleCloseUntilRef.current = Date.now() + 700;
    idle.activate();
    setDocumentAutoScrollDisabled(false);
    setDocumentIdleStage(0);
    if (activeDocumentId) {
      const activeDoc = documentById.get(activeDocumentId);
      const rootDocId = activeDoc?.isTranslation
        ? (activeDoc.translationForDocumentId || activeDocumentId)
        : activeDocumentId;
      const rootDoc = rootDocId ? documentById.get(rootDocId) : null;
      const hasTranslationPair = Boolean(
        rootDoc
        && rootDoc.translationDocumentId
        && documentById.get(rootDoc.translationDocumentId)
      );

      if (hasTranslationPair && rootDoc) {
        setActiveDocumentId(null);
        setChooserDocumentId(rootDoc.id);
        setJumpToSectionId(null);
        setCurrentSectionId(null);
        idle.resetInactivityTimer();
        return;
      }
    }

    if (chooserDocumentId !== null || activeDocumentId !== null) {
      setActiveDocumentId(null);
      setChooserDocumentId(null);
      setJumpToSectionId(null);
      setCurrentSectionId(null);
      idle.resetInactivityTimer();
    }
  }, [activeDocumentId, chooserDocumentId, documentById, idle.activate, idle.resetInactivityTimer, setDocumentAutoScrollDisabled, setDocumentIdleStage]);

  const jumpToSection = useCallback((sectionId: string) => {
    suppressIdleCloseUntilRef.current = Date.now() + 700;
    idle.activate();
    setJumpToSectionId(sectionId);
    setCurrentSectionId(sectionId);
    setDocumentIdleStage(0);
    idle.resetInactivityTimer();
  }, [idle.activate, idle.resetInactivityTimer, setDocumentIdleStage]);

  const handleActiveSectionChange = useCallback((sectionId: string) => {
    setCurrentSectionId((prev) => {
      return prev === sectionId ? prev : sectionId;
    });
  }, []);

  const handleAutoScrollWrap = useCallback(() => {
    if (!autoReturnHomeByWraps) return;
    autoScrollWrapCountRef.current += 1;
    if (autoScrollWrapCountRef.current >= 2) {
      autoScrollWrapCountRef.current = 0;
      goHome();
    }
  }, [autoReturnHomeByWraps, goHome]);

  const handleZoomStateChange = useCallback((isZoomed: boolean) => {
    isDocumentZoomedRef.current = isZoomed;
    setIsDocumentZoomed((prev) => {
      return prev === isZoomed ? prev : isZoomed;
    });
  }, [setIsDocumentZoomed]);

  const handleScrollerUserInteraction = useCallback(() => {
    if (supportsDocumentHome && activeDocumentId !== null) {
      setDocumentIdleStage(0);
      setDocumentAutoScrollDisabled((prev) => { return prev || true; });
    }
  }, [supportsDocumentHome, activeDocumentId, setDocumentAutoScrollDisabled, setDocumentIdleStage]);

  const handleDocumentCardPress = useCallback((docId: string, onSelect: (id: string) => void) => {
    const now = Date.now();
    const last = lastCardSelectionRef.current;
    if (last && last.id === docId && now - last.at < 700) return;
    lastCardSelectionRef.current = { id: docId, at: now };

    suppressIdleCloseUntilRef.current = now + 1200 + CARD_OPEN_DELAY_MS;
    idle.activate();
    setDocumentIdleStage(0);
    idle.resetInactivityTimer();
    setPendingOpenDocId(docId);
    if (cardOpenTimerRef.current) {
      clearTimeout(cardOpenTimerRef.current);
      cardOpenTimerRef.current = null;
    }
    cardOpenTimerRef.current = setTimeout(() => {
      cardOpenTimerRef.current = null;
      onSelect(docId);
    }, CARD_OPEN_DELAY_MS);
  }, [idle.activate, idle.resetInactivityTimer, setDocumentIdleStage]);

  const updateThumbnailAspectRatio = useCallback((pageId: string, ratio: number) => {
    const clamped = Math.max(0.45, Math.min(ratio, 2.2));
    setThumbnailAspectRatios((prev) => {
      if (Math.abs((prev[pageId] || 0) - clamped) < 0.01) return prev;
      return { ...prev, [pageId]: clamped };
    });
  }, []);

  let sections: ScrollSection[] = urlContent;
  if (usePlaylistMode) {
    if (supportsDocumentHome && activeDocument) {
      sections = activeDocument.pages;
    } else {
      sections = playlistSections;
    }
  }

  const isLoading = usePlaylistMode ? playlist.isLoading : urlLoading;
  const hasError = usePlaylistMode ? Boolean(playlist.error) : urlError !== null;
  const errorMessage = usePlaylistMode
    ? (playlist.error ? playlist.error.message : '')
    : (urlError || '');

  useContentUpdates({
    onPlaylistUpdated: (playlistId) => {
      if (usePlaylistMode && playlistId === scrollConfig.playlistId) {
        playlist.refresh();
      }
    },
    onConfigUpdated: () => {
      if (!usePlaylistMode) loadUrlContent();
    },
  });

  useEffect(() => {
    if (isLoading) {
      setStatus('loading');
    } else if (hasError) {
      setStatus('error');
    } else {
      setStatus('playing');
    }
  }, [isLoading, hasError, setStatus]);

  // Block native browser zoom gestures in this template.
  // Open-document zoom still works through TouchScroller's custom zoom logic.
  useEffect(() => {
    const onWheelCapture = (event: WheelEvent) => {
      if (event.ctrlKey) event.preventDefault();
    };

    const onGesture = (event: Event) => {
      event.preventDefault();
    };

    const onTouchCapture = (event: TouchEvent) => {
      if (event.touches.length >= 2) event.preventDefault();
    };

    document.addEventListener('wheel', onWheelCapture, { capture: true, passive: false });
    document.addEventListener('gesturestart', onGesture, { capture: true, passive: false });
    document.addEventListener('gesturechange', onGesture, { capture: true, passive: false });
    document.addEventListener('gestureend', onGesture, { capture: true, passive: false });
    document.addEventListener('touchstart', onTouchCapture, { capture: true, passive: false });
    document.addEventListener('touchmove', onTouchCapture, { capture: true, passive: false });

    return () => {
      document.removeEventListener('wheel', onWheelCapture, true);
      document.removeEventListener('gesturestart', onGesture, true);
      document.removeEventListener('gesturechange', onGesture, true);
      document.removeEventListener('gestureend', onGesture, true);
      document.removeEventListener('touchstart', onTouchCapture, true);
      document.removeEventListener('touchmove', onTouchCapture, true);
    };
  }, []);

  if (isLoading) {
    return (
      <div style={{
        width: '100%', height: '100%', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: scrollConfig.backgroundColor || '#000',
        color: '#fff', fontSize: '2rem', fontFamily: 'system-ui',
      }}>
        Loading content...
      </div>
    );
  }

  if (hasError) {
    return (
      <div style={{
        width: '100%', height: '100%', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: scrollConfig.backgroundColor || '#000',
        color: '#f44', fontSize: '1.5rem', fontFamily: 'system-ui',
        textAlign: 'center', padding: '2rem',
      }}>
        <div>
          <div style={{ marginBottom: '1rem' }}>Error loading content</div>
          <div style={{ fontSize: '1rem', color: '#aaa' }}>{errorMessage}</div>
        </div>
      </div>
    );
  }

  const renderDocumentCards = (
    documents: PlaylistDocument[],
    onSelect: (docId: string) => void
  ) => {
    const hasPendingOpen = pendingOpenDocId !== null;
    return (
      <div style={{
        width: '100%',
        height: '100%',
        backgroundColor: '#ffffff',
        display: 'flex',
        flexDirection: 'column',
        gap: '18px',
        padding: '34px 18px',
        boxSizing: 'border-box',
      }}>
        {documents.map((doc, index) => {
          const isPendingCard = pendingOpenDocId === doc.id;
          const cardCaption = (doc.caption && doc.caption.trim().length > 0)
            ? doc.caption
            : (doc.label || `Document ${index + 1}`);
          return (
            <button
              key={doc.id}
              type="button"
              disabled={hasPendingOpen && !isPendingCard}
              onPointerDown={(event) => {
                if (event.pointerType === 'mouse' && event.button !== 0) return;
                event.preventDefault();
                handleDocumentCardPress(doc.id, onSelect);
              }}
              onClick={(event) => {
                if (event.detail !== 0) return;
                handleDocumentCardPress(doc.id, onSelect);
              }}
              style={{
                flex: '1 1 0',
                minHeight: 0,
                width: '100%',
                border: 'none',
                borderRadius: 0,
                overflow: 'hidden',
                cursor: 'pointer',
                backgroundColor: '#ffffff',
                display: 'flex',
                flexDirection: 'column',
                padding: 0,
                margin: 0,
                touchAction: 'manipulation',
                WebkitTapHighlightColor: 'transparent',
                transform: isPendingCard ? 'scale(0.985)' : 'scale(1)',
                opacity: hasPendingOpen && !isPendingCard ? 0.78 : 1,
                transition: 'transform 420ms cubic-bezier(0.22, 0.61, 0.36, 1), opacity 300ms ease',
              }}
            >
              <div style={{
                flex: '1 1 auto',
                minHeight: 0,
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: '#ffffff',
                padding: '2px 12px 4px 12px',
                boxSizing: 'border-box',
              }}>
                {doc.thumbnailUrl ? (
                  <img
                    src={doc.thumbnailUrl}
                    alt={doc.caption || doc.label}
                    draggable={false}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'contain',
                      objectPosition: 'center center',
                      display: 'block',
                    }}
                  />
                ) : (
                  <div style={{ color: '#666', fontSize: '1.05rem', fontFamily: 'system-ui' }}>
                    {renderAsteriskBold(doc.label)}
                  </div>
                )}
              </div>
              <div style={{
                padding: '6px 24% 8px 24%',
                color: '#1f1f1f',
                fontFamily: 'system-ui',
                fontSize: '0.82rem',
                lineHeight: 1.3,
                textAlign: 'left',
              }}>
                {renderAsteriskBold(cardCaption)}
              </div>
            </button>
          );
        })}
      </div>
    );
  };

  const navButtonBaseStyle: React.CSSProperties = {
    position: 'absolute',
    top: '18px',
    zIndex: 30,
    width: '48px',
    height: '48px',
    borderRadius: '24px',
    border: 'none',
    backgroundColor: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#fff',
    fontSize: '1rem',
    lineHeight: 1,
    cursor: 'pointer',
    boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
    transition: 'background-color 200ms',
    WebkitTapHighlightColor: 'transparent',
  };

  if (supportsDocumentHome && chooserDocument) {
    const translationDoc = chooserDocument.translationDocumentId
      ? documentById.get(chooserDocument.translationDocumentId)
      : null;
    const chooserCards = [chooserDocument, translationDoc].filter(Boolean) as PlaylistDocument[];

    return (
      <div style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}>
        <button
          type="button"
          onClick={goBack}
          style={{
            ...navButtonBaseStyle,
            left: '14px',
          }}
        >
          {'\u2190'}
        </button>
        <button
          type="button"
          onClick={goHome}
          style={{
            ...navButtonBaseStyle,
            right: '14px',
          }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path
              d="M3 12L5 10M5 10L12 3L19 10M5 10V20C5 20.55 5.45 21 6 21H9M19 10L21 12M19 10V20C19 20.55 18.55 21 18 21H15M9 21C9.55 21 10 20.55 10 20V16C10 15.45 10.45 15 11 15H13C13.55 15 14 15.45 14 16V20C14 20.55 14.45 21 15 21M9 21H15"
              stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            />
          </svg>
        </button>
        {renderDocumentCards(chooserCards, openDocumentVariant)}
        {scrollConfig.idle && scrollConfig.idle.url && (
          <IdleScreen isIdle={idle.isIdle} idle={scrollConfig.idle} />
        )}
      </div>
    );
  }

  if (supportsDocumentHome && !activeDocument) {
    return (
      <div style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}>
        {renderDocumentCards(rootDocuments, openDocument)}
        {scrollConfig.idle && scrollConfig.idle.url && (
          <IdleScreen isIdle={idle.isIdle} idle={scrollConfig.idle} />
        )}
      </div>
    );
  }

  const thumbnailBarHeight = supportsDocumentHome ? 132 : 0;
  const autoScrollStartDelayMs = supportsDocumentHome && Boolean(activeDocument)
    ? DOC_OPEN_AUTO_SCROLL_DELAY_MS
    : inactivityTimeoutMs;

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}>
      {supportsDocumentHome && (
        <>
          <button
            type="button"
            onClick={goBack}
            style={{
              ...navButtonBaseStyle,
              left: '14px',
            }}
          >
            {'\u2190'}
          </button>
          <button
            type="button"
            onClick={goHome}
            style={{
              ...navButtonBaseStyle,
              right: '14px',
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path
                d="M3 12L5 10M5 10L12 3L19 10M5 10V20C5 20.55 5.45 21 6 21H9M19 10L21 12M19 10V20C19 20.55 18.55 21 18 21H15M9 21C9.55 21 10 20.55 10 20V16C10 15.45 10.45 15 11 15H13C13.55 15 14 15.45 14 16V20C14 20.55 14.45 21 15 21M9 21H15"
                stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              />
            </svg>
          </button>
        </>
      )}
      <div style={{
        width: '100%',
        height: supportsDocumentHome ? `calc(100% - ${thumbnailBarHeight}px)` : '100%',
      }}>
        <TouchScroller
          content={sections}
          autoScroll={autoScrollActive}
          autoScrollSpeed={scrollConfig.autoScrollSpeed}
          inactivityTimeout={inactivityTimeoutMs}
          autoScrollStartDelayMs={autoScrollStartDelayMs}
          onAutoScrollWrap={handleAutoScrollWrap}
          onInteraction={idle.resetInactivityTimer}
          onUserInteraction={handleScrollerUserInteraction}
          backgroundColor={scrollConfig.backgroundColor}
          fit={normalizedFit}
          resetToFirstFrame={scrollConfig.resetToFirstFrame}
          isIdle={idle.isIdle}
          jumpToSectionId={supportsDocumentHome ? jumpToSectionId : null}
          onActiveSectionChange={supportsDocumentHome && activeDocument ? handleActiveSectionChange : undefined}
          zoomEnabled={supportsDocumentHome && Boolean(activeDocument)}
          zoomImageOnly={true}
          onZoomStateChange={supportsDocumentHome && activeDocument ? handleZoomStateChange : undefined}
          forceResetZoomSignal={supportsDocumentHome && activeDocument ? zoomResetRequestId : undefined}
        />
      </div>
      {supportsDocumentHome && activeDocument && (
        <div style={{
          width: '100%',
          height: `${thumbnailBarHeight}px`,
          backgroundColor: '#ffffff',
          borderTop: '1px solid #e5e7eb',
          padding: '10px 12px',
          boxSizing: 'border-box',
          overflowX: 'auto',
          overflowY: 'hidden',
        }}>
          <div style={{
            minWidth: '100%',
            width: 'max-content',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
            margin: '0 auto',
          }}>
            {activeDocument.pages.map((page, index) => {
              const activeId = currentSectionId || jumpToSectionId;
              const isSelected = activeId
                ? activeId === page.id
                : index === 0;
              const defaultPageRatio = 0.72; // page-like fallback (portrait)
              const pageRatio = thumbnailAspectRatios[page.id] || defaultPageRatio;
              const thumbInnerHeight = Math.max(44, thumbnailBarHeight - 20 - 22);
              const thumbWidth = Math.round(thumbInnerHeight * pageRatio);
              return (
                <div
                  key={page.id + '-' + String(index)}
                  style={{
                    width: `${thumbWidth}px`,
                    minWidth: `${thumbWidth}px`,
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'flex-start',
                    gap: '6px',
                  }}
                >
                  <div style={{
                    width: '100%',
                    color: '#111827',
                    fontFamily: 'system-ui',
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    lineHeight: 1,
                    textAlign: 'center',
                  }}>
                    {index + 1}
                  </div>
                  <button
                    type="button"
                    onClick={() => { jumpToSection(page.id); }}
                    style={{
                      width: '100%',
                      height: `${thumbInnerHeight}px`,
                      border: isSelected
                        ? '2px solid #c3b47d'
                        : '1px solid #d1d5db',
                      backgroundColor: '#ffffff',
                      borderRadius: '4px',
                      padding: 0,
                      overflow: 'hidden',
                      cursor: 'pointer',
                      display: 'block',
                    }}
                  >
                    {page.type === 'video' ? (
                      <div style={{
                        width: '100%',
                        height: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#4b5563',
                        fontFamily: 'system-ui',
                        fontSize: '0.92rem',
                      }}>
                        {`Video ${index + 1}`}
                      </div>
                    ) : (
                      <img
                        src={page.content}
                        alt={`Page ${index + 1}`}
                        draggable={false}
                        loading={index > 3 ? 'lazy' : 'eager'}
                        onLoad={(event) => {
                          const img = event.currentTarget;
                          if (img.naturalWidth > 0 && img.naturalHeight > 0) {
                            updateThumbnailAspectRatio(page.id, img.naturalWidth / img.naturalHeight);
                          }
                        }}
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'contain',
                          objectPosition: 'center center',
                          display: 'block',
                        }}
                      />
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {scrollConfig.idle && scrollConfig.idle.url && (
        <IdleScreen isIdle={idle.isIdle} idle={scrollConfig.idle} />
      )}
    </div>
  );
}

export { TouchScrollTemplate };
export type { TouchScrollTemplateProps };
