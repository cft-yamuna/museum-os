import { useEffect, useCallback, useState } from 'react';
import { useAppShell } from '@/components/core/AppShell';
import { VideoPlayer } from '@/components/core/VideoPlayer';
import { ImageSlide } from '@/components/core/ImageSlide';
import { TransitionLayer } from '@/components/core/TransitionLayer';
import { IdleScreen } from '@/components/core/IdleScreen';
import { usePlaylist } from '@/hooks/usePlaylist';
import { useProximity } from '@/hooks/useMqtt';
import { useHeartbeat } from '@/hooks/useHeartbeat';
import { useContentUpdates } from '@/hooks/useContentUpdates';
import { config } from '@/lib/config';
import type { ProximityConfig } from '@/lib/types';

// ==========================================
// Types
// ==========================================

interface ProximityTemplateProps {
  config: ProximityConfig;
  instanceId: string;
}

// ==========================================
// ProximityTemplate
// ==========================================

export function ProximityTemplate(props: ProximityTemplateProps) {
  const appShell = useAppShell();
  const cfg = props.config;

  const triggerMode = cfg.triggerMode || 'hardware';
  const useHardware = triggerMode === 'hardware' || triggerMode === 'both';
  const useTouch = triggerMode === 'touch' || triggerMode === 'both';

  const proximity = useProximity({
    controllerId: cfg.controllerId,
    activationDistance: cfg.activationDistance,
    deactivationDelay: cfg.deactivationDelay,
    enabled: useHardware,
  });

  // Touch trigger state
  const [touchTriggered, setTouchTriggered] = useState(false);

  // Effective presence: real sensor OR touch
  const isPresent = (useHardware && proximity.isPresent) || (useTouch && touchTriggered);

  const playlist = usePlaylist({
    playlistId: cfg.playlistId || '',
    defaultDuration: 5,
    shuffle: false,
    loop: true,
    enabled: cfg.contentType === 'slideshow',
  });

  const { setStatus, setCurrentContent } = useHeartbeat({
    deviceId: config().deviceId,
    templateType: 'proximity',
    instanceId: props.instanceId,
  });

  // Listen for playlist updates via WebSocket
  useContentUpdates({
    onPlaylistUpdated: (playlistId) => {
      if (cfg.contentType === 'slideshow' && playlistId === cfg.playlistId) {
        playlist.refresh();
      }
    },
  });

  // ---- Update heartbeat based on presence ----
  useEffect(() => {
    if (isPresent) {
      setStatus('playing');
      if (cfg.contentType === 'video' && cfg.videoUrl) {
        setCurrentContent(cfg.videoUrl);
      } else if (cfg.contentType === 'image' && cfg.imageUrl) {
        setCurrentContent(cfg.imageUrl);
      } else if (cfg.contentType === 'slideshow' && playlist.currentItem) {
        setCurrentContent(playlist.currentItem.id);
      } else {
        setCurrentContent(undefined);
      }
    } else {
      setStatus('idle');
      setCurrentContent(undefined);
    }
  }, [
    isPresent,
    cfg.contentType,
    cfg.videoUrl,
    cfg.imageUrl,
    playlist.currentItem,
    setStatus,
    setCurrentContent,
  ]);

  // ---- Callbacks ----

  const handleVideoEnded = useCallback(() => {
    // If touch-triggered, reset on video end so user can tap again
    if (useTouch && !useHardware) {
      setTouchTriggered(false);
    }
  }, [useTouch, useHardware]);

  const handleVideoError = useCallback((error: Error) => {
    setStatus('error');
    appShell.send('error', { type: 'playback', message: error.message });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setStatus]);

  const handleItemComplete = useCallback(() => {
    playlist.onItemComplete();
  }, [playlist.onItemComplete]);

  // ---- Touch trigger handler ----
  const handleScreenTap = useCallback(() => {
    if (!useTouch) return;
    setTouchTriggered((prev) => { return !prev; });
  }, [useTouch]);

  // ---- Styles ----

  const containerStyle: React.CSSProperties = {
    position: 'relative',
    width: '100%',
    height: '100%',
    backgroundColor: cfg.backgroundColor || '#000',
    overflow: 'hidden',
    transform: 'translateZ(0)',
    cursor: useTouch ? 'pointer' : 'default',
  };

  const contentLayerStyle: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    opacity: isPresent ? 1 : 0,
    transition: 'opacity 600ms ease-in-out',
    pointerEvents: isPresent ? 'auto' : 'none',
    zIndex: isPresent ? 5 : 1,
    transform: 'translateZ(0)',
  };

  // ---- Render active content based on contentType ----

  const renderActiveContent = () => {
    if (cfg.contentType === 'video' && cfg.videoUrl) {
      return (
        <VideoPlayer
          src={cfg.videoUrl}
          muted={false}
          fit={cfg.fit || 'cover'}
          backgroundColor={cfg.backgroundColor || '#000'}
          loop={true}
          autoPlay={true}
          onEnded={handleVideoEnded}
          onError={handleVideoError}
        />
      );
    }

    if (cfg.contentType === 'image' && cfg.imageUrl) {
      return (
        <ImageSlide
          src={cfg.imageUrl}
          fit={cfg.fit || 'cover'}
          backgroundColor={cfg.backgroundColor || '#000'}
        />
      );
    }

    if (cfg.contentType === 'slideshow' && playlist.currentItem) {
      const currentItem = playlist.currentItem;
      return (
        <TransitionLayer
          contentKey={currentItem.id + '-' + playlist.currentIndex}
          transition="fade"
          transitionDuration={500}
        >
          {currentItem.type === 'video' ? (
            <VideoPlayer
              src={currentItem.url}
              muted={false}
              fit={cfg.fit || 'cover'}
              backgroundColor={cfg.backgroundColor || '#000'}
              loop={false}
              autoPlay={true}
              onEnded={handleItemComplete}
              onError={handleVideoError}
            />
          ) : (
            <ImageSlide
              src={currentItem.url}
              fit={cfg.fit || 'cover'}
              backgroundColor={cfg.backgroundColor || '#000'}
            />
          )}
        </TransitionLayer>
      );
    }

    return null;
  };

  // ---- Render ----

  return (
    <div style={containerStyle} onClick={handleScreenTap}>
      {/* Active content layer - fades in/out based on presence */}
      <div style={contentLayerStyle}>
        {renderActiveContent()}
      </div>

      {/* Idle screen overlay */}
      {cfg.idle && (
        <IdleScreen
          isIdle={!isPresent}
          idle={cfg.idle}
        />
      )}

      {/* Touch hint when in touch/both mode and idle */}
      {useTouch && !isPresent && (
        <div style={{
          position: 'absolute',
          bottom: '40px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 10,
          color: 'rgba(255,255,255,0.7)',
          fontSize: '14px',
          fontFamily: 'system-ui, sans-serif',
          textAlign: 'center',
          animation: 'pulse 2s ease-in-out infinite',
          pointerEvents: 'none',
        }}>
          Tap to activate
        </div>
      )}
    </div>
  );
}
