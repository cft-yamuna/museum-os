import { useEffect, useRef, useCallback, useState } from 'react';
import { useAppShell } from '@/components/core/AppShell';
import { IdleScreen } from '@/components/core/IdleScreen';
import { useMonophone } from '@/hooks/useMqtt';
import { useHeartbeat } from '@/hooks/useHeartbeat';
import { config } from '@/lib/config';
import type { VideoSyncConfig } from '@/lib/types';

// ==========================================
// Types
// ==========================================

interface MonophoneVideoTemplateProps {
  config: VideoSyncConfig;
  instanceId: string;
}

// ==========================================
// MonophoneVideoTemplate
//
// Two-state display:
//   IDLE:    shows idleImageUrl (poster) or idleVideoUrl (looping video)
//   ACTIVE:  plays videoUrl (main video) after trigger
//
// Trigger modes: hardware (monophone/sensor), touch (screen tap), or both
// ==========================================

function MonophoneVideoTemplate(props: MonophoneVideoTemplateProps) {
  const appShell = useAppShell();
  const cfg = props.config;

  const triggerMode = cfg.triggerMode || 'hardware';
  const useHardware = triggerMode === 'hardware' || triggerMode === 'both';
  const useTouch = triggerMode === 'touch' || triggerMode === 'both';

  const idleType = cfg.idleType || 'image';
  const hasIdleImage = idleType === 'image' && !!cfg.idleImageUrl;
  const hasIdleVideo = idleType === 'video' && !!cfg.idleVideoUrl;

  const monophone = useMonophone({ controllerId: cfg.controllerId, enabled: useHardware });

  // Test simulator state (for testing without hardware)
  const [simTriggered, setSimTriggered] = useState(false);
  const [showSimulator, setShowSimulator] = useState(false);

  // Touch trigger state
  const [touchTriggered, setTouchTriggered] = useState(false);
  // Reset delay (cooldown) state — prevents immediate re-trigger
  const [inCooldown, setInCooldown] = useState(false);
  const cooldownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Effective trigger: real hardware OR touch OR simulator (but NOT during cooldown)
  const isTriggered = !inCooldown && ((useHardware && monophone.isPickedUp) || (useTouch && touchTriggered) || simTriggered);

  const { setStatus, setCurrentContent } = useHeartbeat({
    deviceId: config().deviceId,
    templateType: 'video-sync',
    instanceId: props.instanceId,
  });

  // ---- Refs ----
  const mainVideoRef = useRef<HTMLVideoElement>(null);
  const idleVideoRef = useRef<HTMLVideoElement>(null);
  const isPlayingRef = useRef(false);
  const mountedRef = useRef(true);

  // ---- Cleanup on unmount ----
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (mainVideoRef.current) {
        mainVideoRef.current.pause();
        mainVideoRef.current.currentTime = 0;
      }
      if (cooldownTimerRef.current !== null) {
        clearTimeout(cooldownTimerRef.current);
        cooldownTimerRef.current = null;
      }
    };
  }, []);

  // ---- Start main video playback ----
  const startVideo = useCallback(() => {
    const video = mainVideoRef.current;
    if (!video) return;

    video.currentTime = 0;

    let playResult;
    try {
      playResult = video.play();
    } catch (_e) {
      return;
    }

    if (playResult && typeof playResult.then === 'function') {
      playResult.then(() => {
        if (mountedRef.current) {
          isPlayingRef.current = true;
        }
      }).catch((err) => {
        console.error('[VideoSync] Video play failed:', err);
      });
    } else {
      isPlayingRef.current = true;
    }
  }, []);

  // ---- Pause main video ----
  const pauseVideo = useCallback(() => {
    const video = mainVideoRef.current;
    if (!video) return;

    video.pause();
    isPlayingRef.current = false;
  }, []);

  // ---- React to trigger state ----
  useEffect(() => {
    if (isTriggered) {
      // Pause idle video if playing
      if (idleVideoRef.current) {
        idleVideoRef.current.pause();
      }
      startVideo();
    } else {
      if (isPlayingRef.current) {
        pauseVideo();
      }
      // Resume idle video if applicable
      if (idleVideoRef.current && hasIdleVideo) {
        idleVideoRef.current.play().catch(() => {});
      }
    }
  }, [isTriggered, startVideo, pauseVideo, hasIdleVideo]);

  // ---- Update heartbeat status ----
  useEffect(() => {
    if (isTriggered) {
      setStatus('playing');
      setCurrentContent(cfg.videoUrl);
    } else {
      setStatus('idle');
      setCurrentContent(undefined);
    }
  }, [isTriggered, cfg.videoUrl, setStatus, setCurrentContent]);

  // ---- Handle main video error ----
  const handleVideoError = useCallback(() => {
    setStatus('error');
    appShell.send('error', {
      type: 'playback',
      message: 'Video failed to load: ' + cfg.videoUrl,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg.videoUrl, setStatus]);

  // ---- Handle main video ended — return to idle ----
  const handleVideoEnded = useCallback(() => {
    isPlayingRef.current = false;
    // Reset touch trigger so user can tap again
    if (useTouch) {
      setTouchTriggered(false);
    }
    // Reset simulator trigger
    setSimTriggered(false);
    // Apply reset delay (cooldown) if configured
    const resetDelaySec = cfg.resetDelay || 0;
    if (resetDelaySec > 0) {
      setInCooldown(true);
      cooldownTimerRef.current = setTimeout(() => {
        cooldownTimerRef.current = null;
        if (mountedRef.current) {
          setInCooldown(false);
        }
      }, resetDelaySec * 1000);
    }
  }, [useTouch, cfg.resetDelay]);

  // ---- Touch trigger handler ----
  const handleScreenTap = useCallback(() => {
    if (!useTouch) return;
    if (touchTriggered) {
      // Tap while playing → stop and go back to idle
      setTouchTriggered(false);
    } else {
      // Tap while idle → start video
      setTouchTriggered(true);
    }
  }, [useTouch, touchTriggered]);

  // ---- Styles ----

  const containerStyle: React.CSSProperties = {
    position: 'relative',
    width: '100%',
    height: '100%',
    backgroundColor: cfg.backgroundColor || '#000',
    overflow: 'hidden',
    cursor: useTouch ? 'pointer' : 'default',
  };

  const layerBase: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    objectFit: cfg.fit || 'cover',
    transform: 'translateZ(0)',
  };

  const transitionMs = cfg.transitionDuration || 600;

  const idleLayerStyle: React.CSSProperties = {
    ...layerBase,
    opacity: isTriggered ? 0 : 1,
    transition: 'opacity ' + transitionMs + 'ms ease-in-out',
    zIndex: 2,
  };

  const mainVideoStyle: React.CSSProperties = {
    ...layerBase,
    opacity: isTriggered ? 1 : 0,
    transition: 'opacity ' + transitionMs + 'ms ease-in-out',
    zIndex: 3,
  };

  // ---- Render ----

  return (
    <div style={containerStyle} onClick={handleScreenTap}>
      {/* LAYER 1: Idle content (BEFORE trigger) */}
      {hasIdleImage && (
        <img
          src={cfg.idleImageUrl}
          alt="Idle poster"
          style={idleLayerStyle}
          draggable={false}
        />
      )}
      {hasIdleVideo && (
        <video
          ref={idleVideoRef}
          src={cfg.idleVideoUrl}
          style={idleLayerStyle}
          playsInline
          autoPlay
          muted={false}
          loop
          preload="auto"
        />
      )}

      {/* LAYER 1b: Title text overlay on idle content */}
      {cfg.titleText && !isTriggered && (
        <div style={{
          position: 'absolute',
          bottom: '10%',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 4,
          color: '#ffffff',
          fontSize: '28px',
          fontWeight: '600',
          textAlign: 'center',
          textShadow: '0 2px 8px rgba(0,0,0,0.7)',
          fontFamily: 'system-ui, sans-serif',
          maxWidth: '80%',
          opacity: isTriggered ? 0 : 1,
          transition: 'opacity ' + transitionMs + 'ms ease-in-out',
          pointerEvents: 'none',
        }}>
          {cfg.titleText}
        </div>
      )}

      {/* LAYER 2: Main video (AFTER trigger) */}
      <video
        ref={mainVideoRef}
        src={cfg.videoUrl}
        style={mainVideoStyle}
        playsInline
        muted={false}
        preload="auto"
        onError={handleVideoError}
        onEnded={handleVideoEnded}
      />

      {/* LAYER 3: Idle screen overlay (generic, if configured) */}
      {cfg.idle && (
        <IdleScreen
          isIdle={!isTriggered}
          idle={cfg.idle}
        />
      )}

      {/* Touch hint */}
      {useTouch && !isTriggered && (
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
          Tap to play
        </div>
      )}

      {/* Test Simulator — toggle with triple-click on top-right corner */}
      <VideoTestSimulator
        show={showSimulator}
        onToggle={() => { setShowSimulator(!showSimulator); }}
        isTriggered={simTriggered}
        onTrigger={() => { setSimTriggered(true); }}
        onStop={() => { setSimTriggered(false); }}
      />
    </div>
  );
}

// ==========================================
// VideoTestSimulator — on-screen trigger for testing without hardware
// Toggle visibility by triple-clicking top-right corner
// ==========================================

function VideoTestSimulator(props: {
  show: boolean;
  onToggle: () => void;
  isTriggered: boolean;
  onTrigger: () => void;
  onStop: () => void;
}) {
  const show = props.show;
  const onToggle = props.onToggle;
  const isTriggered = props.isTriggered;
  const onTrigger = props.onTrigger;
  const onStop = props.onStop;

  const clickCountRef = useRef(0);
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleHotspotClick = useCallback(() => {
    clickCountRef.current = clickCountRef.current + 1;

    if (clickTimerRef.current !== null) {
      clearTimeout(clickTimerRef.current);
    }

    if (clickCountRef.current >= 3) {
      clickCountRef.current = 0;
      onToggle();
    } else {
      clickTimerRef.current = setTimeout(() => {
        clickCountRef.current = 0;
        clickTimerRef.current = null;
      }, 600);
    }
  }, [onToggle]);

  const hotspotStyle: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    right: 0,
    width: '60px',
    height: '60px',
    zIndex: 9999,
    cursor: 'default',
    background: 'transparent',
  };

  if (!show) {
    return <div style={hotspotStyle} onClick={handleHotspotClick} />;
  }

  const panelStyle: React.CSSProperties = {
    position: 'absolute',
    top: '10px',
    right: '10px',
    zIndex: 9998,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    borderRadius: '12px',
    padding: '16px',
    minWidth: '200px',
    color: '#fff',
    fontFamily: 'system-ui, sans-serif',
    fontSize: '13px',
  };

  const headerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '12px',
    paddingBottom: '8px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.15)',
  };

  const btnStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '8px 16px',
    borderRadius: '8px',
    border: 'none',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '600',
    userSelect: 'none',
    WebkitTapHighlightColor: 'transparent',
    backgroundColor: isTriggered ? '#dc2626' : '#16a34a',
    color: '#fff',
    width: '100%',
  };

  const statusDotStyle: React.CSSProperties = {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    backgroundColor: isTriggered ? '#22c55e' : '#ef4444',
    display: 'inline-block',
    marginRight: '6px',
  };

  return (
    <>
      <div style={hotspotStyle} onClick={handleHotspotClick} />
      <div style={panelStyle}>
        <div style={headerStyle}>
          <span style={{ fontWeight: '700', letterSpacing: '0.5px' }}>
            TEST SIM
          </span>
          <button
            onClick={onToggle}
            style={{
              width: '36px',
              height: '36px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '50%',
              border: 'none',
              backgroundColor: 'rgba(255, 255, 255, 0.15)',
              color: '#fff',
              fontSize: '20px',
              fontWeight: '300',
              cursor: 'pointer',
              transition: 'background-color 150ms ease',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            ×
          </button>
        </div>

        <div style={{ marginBottom: '12px', fontSize: '12px', opacity: 0.7 }}>
          <span style={statusDotStyle} />
          Video: {isTriggered ? 'PLAYING' : 'IDLE'}
        </div>

        <div
          style={btnStyle}
          onClick={() => {
            if (isTriggered) {
              onStop();
            } else {
              onTrigger();
            }
          }}
        >
          {isTriggered ? 'Stop Video' : 'Trigger Video'}
        </div>

        <div style={{ marginTop: '12px', fontSize: '11px', opacity: 0.4, lineHeight: '1.4' }}>
          Triple-click top-right corner to hide
        </div>
      </div>
    </>
  );
}

export { MonophoneVideoTemplate };
export type { MonophoneVideoTemplateProps };
