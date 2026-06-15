import { useEffect, useCallback, useState, useRef } from 'react';
import { useAppShell } from '@/components/core/AppShell';
import { VideoPlayer } from '@/components/core/VideoPlayer';
import { ImageSlide } from '@/components/core/ImageSlide';
import { TransitionLayer } from '@/components/core/TransitionLayer';
import { IdleScreen } from '@/components/core/IdleScreen';
import { usePlaylist } from '@/hooks/usePlaylist';
import { useIdleTimer } from '@/hooks/useIdleTimer';
import { useHeartbeat } from '@/hooks/useHeartbeat';
import { useContentUpdates } from '@/hooks/useContentUpdates';
import { CarouselStrip } from './CarouselStrip';
import { DocumentViewer } from './DocumentViewer';
import { config } from '@/lib/config';
import { renderAsteriskBold } from '@/lib/richText';
import type { SlideshowConfig, PlaylistItem } from '@/lib/types';

// ==========================================
// Types
// ==========================================

interface TouchCarouselTemplateProps {
  config: SlideshowConfig;
  instanceId: string;
}

const MANUAL_IMAGE_HOLD_MS = 15000;

function captionFromItem(item: PlaylistItem, index: number): string {
  const metadata = (item.metadata || {}) as Record<string, unknown>;
  const candidates = [
    metadata.caption,
    metadata.title,
    metadata.name,
    metadata.contentName,
    metadata.documentCaption,
  ];

  for (let i = 0; i < candidates.length; i++) {
    const value = candidates[i];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }

  const rawName = item.url.split('?')[0].split('/').pop() || '';
  const withoutExt = rawName.replace(/\.[^.]+$/, '').trim();
  if (withoutExt.length > 0) {
    return decodeURIComponent(withoutExt).replace(/[_-]+/g, ' ');
  }

  return item.type === 'video' ? `Video ${index + 1}` : `Image ${index + 1}`;
}

// ==========================================
// TouchCarouselTemplate
// ==========================================

function TouchCarouselTemplate(props: TouchCarouselTemplateProps) {
  const appShell = useAppShell();
  const slideshowConfig = props.config;

  const hasIdle = slideshowConfig.idle && slideshowConfig.idle.url;
  const isSlideshowMode = slideshowConfig.displayMode === 'slideshow';
  const isDocumentViewer = slideshowConfig.displayMode === 'document-viewer';
  const isCarouselMode = !isSlideshowMode && !isDocumentViewer;
  const thumbSize = slideshowConfig.carouselHeight || 80;
  const carouselRailWidth = thumbSize + 110;
  const manualImageHoldActiveTuple = useState(false);
  const manualImageHoldActive = manualImageHoldActiveTuple[0];
  const setManualImageHoldActive = manualImageHoldActiveTuple[1];
  const manualImageHoldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const manualHoldItemIdRef = useRef<string | null>(null);
  const currentItemIdRef = useRef<string | null>(null);
  const currentItemTypeRef = useRef<PlaylistItem['type'] | null>(null);
  const onItemCompleteRef = useRef<(() => void) | null>(null);

  const clearManualImageHold = useCallback(() => {
    if (manualImageHoldTimerRef.current) {
      clearTimeout(manualImageHoldTimerRef.current);
      manualImageHoldTimerRef.current = null;
    }
    manualHoldItemIdRef.current = null;
    setManualImageHoldActive(false);
  }, []);

  const startManualImageHold = useCallback((itemId: string) => {
    if (manualImageHoldTimerRef.current) {
      clearTimeout(manualImageHoldTimerRef.current);
      manualImageHoldTimerRef.current = null;
    }
    manualHoldItemIdRef.current = itemId;
    setManualImageHoldActive(true);

    manualImageHoldTimerRef.current = setTimeout(() => {
      manualImageHoldTimerRef.current = null;
      const heldItemId = manualHoldItemIdRef.current;
      manualHoldItemIdRef.current = null;
      setManualImageHoldActive(false);
      if (
        heldItemId
        && currentItemIdRef.current === heldItemId
        && currentItemTypeRef.current === 'image'
      ) {
        onItemCompleteRef.current?.();
      }
    }, MANUAL_IMAGE_HOLD_MS);
  }, []);

  const playlist = usePlaylist({
    playlistId: slideshowConfig.playlistId,
    defaultDuration: slideshowConfig.defaultDuration || 8,
    shuffle: slideshowConfig.shuffle || false,
    loop: slideshowConfig.loop !== undefined ? slideshowConfig.loop : true,
    autoAdvance: !isDocumentViewer && !(isCarouselMode && manualImageHoldActive),
  });

  const idleTimeout = config().idleTimeout || 300000;
  const idle = useIdleTimer({
    enabled: Boolean(hasIdle),
    schedule: slideshowConfig.schedule,
    inactivityTimeout: idleTimeout,
    hasContent: playlist.items.length > 0,
    hasContentError: Boolean(playlist.error),
  });

  const { setStatus, setCurrentContent } = useHeartbeat({
    deviceId: config().deviceId,
    templateType: 'slideshow',
    instanceId: props.instanceId,
  });

  useEffect(() => {
    currentItemIdRef.current = playlist.currentItem?.id || null;
    currentItemTypeRef.current = playlist.currentItem?.type || null;
  }, [playlist.currentItem]);

  useEffect(() => {
    onItemCompleteRef.current = playlist.onItemComplete;
  }, [playlist.onItemComplete]);

  useEffect(() => {
    if (!isCarouselMode) {
      clearManualImageHold();
    }
  }, [isCarouselMode, clearManualImageHold]);

  useEffect(() => {
    return () => {
      if (manualImageHoldTimerRef.current) {
        clearTimeout(manualImageHoldTimerRef.current);
        manualImageHoldTimerRef.current = null;
      }
    };
  }, []);

  // Listen for content updates
  useContentUpdates({
    onPlaylistUpdated: (playlistId) => {
      if (playlistId === slideshowConfig.playlistId) {
        playlist.refresh();
      }
    },
  });

  // Update heartbeat based on playlist and idle state
  useEffect(() => {
    if (hasIdle && idle.isIdle) {
      setStatus('idle');
    } else if (playlist.currentItem) {
      setStatus('playing');
      setCurrentContent(playlist.currentItem.id);
    } else if (playlist.isLoading) {
      setStatus('loading');
    } else {
      setStatus('idle');
    }
  }, [hasIdle, idle.isIdle, playlist.currentItem, playlist.isLoading, setStatus, setCurrentContent]);

  // Listen for WebSocket idle command via AppShell
  useEffect(() => {
    if (hasIdle && appShell.isIdle) {
      idle.deactivate('command');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appShell.isIdle]);

  // When AppShell says not idle (activate command), activate our timer too
  useEffect(() => {
    if (hasIdle && !appShell.isIdle && idle.isIdle && idle.idleReason === 'command') {
      idle.activate();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appShell.isIdle]);

  // Disable browser zoom gestures in carousel mode
  useEffect(() => {
    if (!isCarouselMode) return;

    const options: AddEventListenerOptions = { passive: false };
    const preventGesture = (event: Event) => {
      event.preventDefault();
    };
    const preventCtrlWheel = (event: WheelEvent) => {
      if (event.ctrlKey) event.preventDefault();
    };

    document.addEventListener('gesturestart', preventGesture, options);
    document.addEventListener('gesturechange', preventGesture, options);
    document.addEventListener('gestureend', preventGesture, options);
    document.addEventListener('wheel', preventCtrlWheel, options);

    return () => {
      document.removeEventListener('gesturestart', preventGesture);
      document.removeEventListener('gesturechange', preventGesture);
      document.removeEventListener('gestureend', preventGesture);
      document.removeEventListener('wheel', preventCtrlWheel);
    };
  }, [isCarouselMode]);

  // Handle video ended
  const handleVideoEnded = useCallback(() => {
    playlist.onItemComplete();
  }, [playlist.onItemComplete]);

  const handleError = useCallback((error: Error) => {
    setStatus('error');
    appShell.send('error', { type: 'playback', message: error.message });
  }, [setStatus, appShell]);

  // Thumbnail tap → jump to slide
  const handleThumbnailTap = useCallback((index: number) => {
    const tappedItem = playlist.items[index];
    playlist.goTo(index);
    if (!isCarouselMode || !tappedItem) return;

    // Manual image picks should stay fixed for 15 seconds before auto-play resumes.
    if (tappedItem.type === 'image') {
      startManualImageHold(tappedItem.id);
      return;
    }

    clearManualImageHold();
  }, [playlist.items, playlist.goTo, isCarouselMode, startManualImageHold, clearManualImageHold]);

  const handleCarouselInteraction = useCallback(() => {
    if (hasIdle) idle.activate();
  }, [hasIdle, idle]);

  // Document viewer activity handler (keeps idle timer alive)
  const handleDocActivity = useCallback(() => {
    if (hasIdle) idle.activate();
  }, [hasIdle, idle]);

  if (playlist.isLoading) return null; // AppShell shows loading

  const fit = slideshowConfig.fit || 'cover';
  const configuredBg = slideshowConfig.backgroundColor || '#000';
  const bg = isCarouselMode ? '#fff' : configuredBg;
  const documentHomeTimeoutSec = 60;

  // Document Viewer mode: vertical pages with horizontal swipe between documents
  if (isDocumentViewer) {
    if (playlist.items.length === 0) return null;

    return (
      <div style={{ position: 'relative', width: '100%', height: '100%' }}>
        <DocumentViewer
          items={playlist.items}
          backgroundColor={bg}
          fit={fit}
          onActivity={handleDocActivity}
          homeTimeoutSec={documentHomeTimeoutSec}
        />
        {hasIdle && slideshowConfig.idle && (
          <IdleScreen isIdle={idle.isIdle} idle={slideshowConfig.idle} />
        )}
      </div>
    );
  }

  if (!playlist.currentItem) return null;

  const currentItem = playlist.currentItem;
  const currentCaption = captionFromItem(currentItem, playlist.currentIndex);
  const captionMinHeight = isCarouselMode ? 84 : 0;
  const mainMediaInset = isCarouselMode ? 34 : 0;
  const contentSideInset = mainMediaInset;
  const captionTextSideInset = contentSideInset;
  const mediaFit = isCarouselMode ? 'contain' : fit;

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', backgroundColor: bg, touchAction: 'none' }}>
      <div
        style={{
          width: isCarouselMode ? `calc(100% - ${carouselRailWidth}px)` : '100%',
          height: '100%',
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: mainMediaInset,
            left: contentSideInset,
            right: contentSideInset,
            bottom: mainMediaInset,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            style={{
              flex: 1,
              minHeight: 0,
              position: 'relative',
            }}
          >
            <TransitionLayer
              contentKey={currentItem.id + '-' + playlist.currentIndex}
              transition={slideshowConfig.transition || 'fade'}
              transitionDuration={slideshowConfig.transitionDuration || 800}
            >
              {currentItem.type === 'video' ? (
                <VideoPlayer
                  src={currentItem.url}
                  muted={false}
                  fit={mediaFit}
                  backgroundColor={bg}
                  loop={false}
                  autoPlay={true}
                  onEnded={handleVideoEnded}
                  onError={handleError}
                />
              ) : (
                <ImageSlide
                  src={currentItem.url}
                  fit={mediaFit}
                  backgroundColor={bg}
                />
              )}
            </TransitionLayer>
          </div>
          {isCarouselMode && currentCaption && (
            <div
              style={{
                zIndex: 90,
                pointerEvents: 'none',
                minHeight: captionMinHeight,
                marginTop: 10,
                display: 'flex',
                alignItems: 'center',
                color: '#000',
                fontSize: 22,
                fontWeight: 500,
                lineHeight: 1.25,
                textAlign: 'left',
                paddingLeft: captionTextSideInset,
                paddingRight: captionTextSideInset,
                whiteSpace: 'normal',
                overflowWrap: 'anywhere',
                wordBreak: 'break-word',
              }}
            >
              {renderAsteriskBold(currentCaption)}
            </div>
          )}
        </div>
      </div>
      {hasIdle && slideshowConfig.idle && (
        <IdleScreen
          isIdle={idle.isIdle}
          idle={slideshowConfig.idle}
        />
      )}
      {!isSlideshowMode && (
        <CarouselStrip
          items={playlist.items}
          currentIndex={playlist.currentIndex}
          isVisible={true}
          thumbSize={thumbSize}
          onThumbnailTap={handleThumbnailTap}
          onInteraction={handleCarouselInteraction}
        />
      )}
    </div>
  );
}

export { TouchCarouselTemplate };
export type { TouchCarouselTemplateProps };
