import { useEffect, useRef, useState, useCallback } from 'react';
import { useAppShell } from '@/components/core/AppShell';
import { VideoPlayer } from '@/components/core/VideoPlayer';
import { IdleScreen } from '@/components/core/IdleScreen';
import { useMonophone, useButtonPanel } from '@/hooks/useMqtt';
import { useHeartbeat } from '@/hooks/useHeartbeat';
import { config } from '@/lib/config';
import type { MonophoneAudioConfig, ButtonItem } from '@/lib/types';

// ==========================================
// Constants
// ==========================================

const MAX_BUTTONS = 8;
const COLUMN_THRESHOLD = 4;

// ==========================================
// Types
// ==========================================

interface MonophoneAudioTemplateProps {
  config: MonophoneAudioConfig;
  instanceId: string;
}

// ==========================================
// MonophoneAudioTemplate (unified single + multi)
// ==========================================

function MonophoneAudioTemplate(props: MonophoneAudioTemplateProps) {
  const appShell = useAppShell();
  const cfg = props.config;
  const mode = cfg.mode || 'single';
  const delayMs = (cfg.delay || 1) * 1000;
  const shouldLoop = cfg.loop !== undefined ? cfg.loop : false;
  const silenceGapMs = (cfg.silenceGap !== undefined ? cfg.silenceGap : 3) * 1000;

  // Hardware hooks — both modes use monophone; multi also uses buttons
  const monophone = useMonophone({ controllerId: cfg.controllerId, enabled: true });
  const buttons = useButtonPanel({ controllerId: cfg.controllerId, enabled: mode === 'multi' });

  // Test simulator state (for testing without hardware)
  const [simPickedUp, setSimPickedUp] = useState(false);
  const [showSimulator, setShowSimulator] = useState(false);

  // Effective pickup: real hardware OR simulator
  const isPickedUp = monophone.isPickedUp || simPickedUp;

  const { setStatus, setCurrentContent } = useHeartbeat({
    deviceId: config().deviceId,
    templateType: mode === 'single' ? 'monophone-audio' : 'button-audio',
    instanceId: props.instanceId,
  });

  // ---- State ----
  const [activeButton, setActiveButton] = useState<ButtonItem | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  // ---- Refs ----
  const audioRef = useRef<HTMLAudioElement>(null);
  const fadeFrameRef = useRef<number>(0);
  const isPlayingRef = useRef(false);
  const mountedRef = useRef(true);
  const delayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const welcomePlayedRef = useRef(false);
  const isPickedUpRef = useRef(false);

  // Keep ref in sync
  useEffect(() => {
    isPickedUpRef.current = isPickedUp;
  }, [isPickedUp]);

  // ---- Cleanup on unmount ----
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (fadeFrameRef.current) {
        cancelAnimationFrame(fadeFrameRef.current);
        fadeFrameRef.current = 0;
      }
      if (delayTimerRef.current !== null) {
        clearTimeout(delayTimerRef.current);
        delayTimerRef.current = null;
      }
      if (silenceTimerRef.current !== null) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
      const audio = audioRef.current;
      if (audio) {
        audio.pause();
        audio.currentTime = 0;
      }
    };
  }, []);

  // ---- Cancel all timers helper ----
  const cancelAllTimers = useCallback(() => {
    if (fadeFrameRef.current) {
      cancelAnimationFrame(fadeFrameRef.current);
      fadeFrameRef.current = 0;
    }
    if (delayTimerRef.current !== null) {
      clearTimeout(delayTimerRef.current);
      delayTimerRef.current = null;
    }
    if (silenceTimerRef.current !== null) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  // ---- Fade out audio using requestAnimationFrame ----
  const fadeOutAudio = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const fadeOutDuration = cfg.fadeOutDuration || 1000;
    const startVolume = audio.volume;
    let startTime = -1;

    if (fadeFrameRef.current) {
      cancelAnimationFrame(fadeFrameRef.current);
      fadeFrameRef.current = 0;
    }

    function step(timestamp: number) {
      if (!mountedRef.current) return;

      if (startTime < 0) {
        startTime = timestamp;
      }

      const elapsed = timestamp - startTime;
      const progress = elapsed / fadeOutDuration;

      if (progress >= 1) {
        if (audio) {
          audio.volume = 0;
          audio.pause();
          audio.currentTime = 0;
          audio.volume = 1;
        }
        fadeFrameRef.current = 0;
        isPlayingRef.current = false;
        if (mountedRef.current) {
          setIsPlaying(false);
        }
        return;
      }

      const newVolume = startVolume * (1 - progress);
      if (audio) {
        audio.volume = Math.max(0, newVolume);
      }

      fadeFrameRef.current = requestAnimationFrame(step);
    }

    fadeFrameRef.current = requestAnimationFrame(step);
  }, [cfg.fadeOutDuration]);

  // ---- Stop everything immediately (for hangup) ----
  const stopAll = useCallback(() => {
    cancelAllTimers();
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
      audio.volume = 1;
    }
    isPlayingRef.current = false;
    setIsPlaying(false);
    setActiveButton(null);
    welcomePlayedRef.current = false;
  }, [cancelAllTimers]);

  // ---- Play audio (with optional delay) ----
  const playAudio = useCallback((src?: string, useDelay?: boolean) => {
    const audio = audioRef.current;
    if (!audio) return;

    // Cancel any ongoing fade, delay, or silence gap
    cancelAllTimers();

    audio.pause();
    audio.currentTime = 0;

    if (src) {
      audio.src = src;
      audio.load();
    }
    audio.volume = 1;

    const actualDelay = useDelay !== false ? delayMs : 0;

    const attemptPlay = () => {
      if (!mountedRef.current || !audio) return;
      // Check handset is still up before playing
      if (!isPickedUpRef.current && mode !== 'single') return;

      let playResult: Promise<void> | undefined;
      try {
        playResult = audio.play();
      } catch (_e) {
        return;
      }

      if (playResult && typeof playResult.then === 'function') {
        playResult.then(() => {
          if (!mountedRef.current) return;
          isPlayingRef.current = true;
          setIsPlaying(true);
        }).catch((err: unknown) => {
          console.error('[MonophoneAudio] Audio play failed:', err);
          // Retry once on autoplay policy rejection — user may not have interacted yet
          if (err instanceof Error && err.name === 'NotAllowedError') {
            const retryOnInteraction = () => {
              if (!mountedRef.current || !audio) return;
              audio.play().then(() => {
                if (!mountedRef.current) return;
                isPlayingRef.current = true;
                setIsPlaying(true);
              }).catch(() => { /* give up */ });
              document.removeEventListener('pointerdown', retryOnInteraction);
              document.removeEventListener('keydown', retryOnInteraction);
            };
            document.addEventListener('pointerdown', retryOnInteraction, { once: true });
            document.addEventListener('keydown', retryOnInteraction, { once: true });
          }
        });
      } else {
        isPlayingRef.current = true;
        setIsPlaying(true);
      }
    };

    if (actualDelay > 0) {
      delayTimerRef.current = setTimeout(() => {
        delayTimerRef.current = null;
        attemptPlay();
      }, actualDelay);
    } else {
      attemptPlay();
    }
  }, [delayMs, cancelAllTimers, mode]);

  // ---- Handle audio ended ----
  const handleAudioEnded = useCallback(() => {
    if (!mountedRef.current) return;
    isPlayingRef.current = false;
    setIsPlaying(false);

    if (mode === 'single') {
      if (shouldLoop && isPickedUpRef.current) {
        // Re-play if loop is enabled and handset still up
        playAudio(undefined, false);
      }
      // Otherwise just stay silent until hangup
    } else if (mode === 'multi') {
      // Multi mode: story ended → silence gap → replay welcome
      setActiveButton(null);

      if (!isPickedUpRef.current) return; // handset already down, don't replay

      silenceTimerRef.current = setTimeout(() => {
        silenceTimerRef.current = null;
        if (!mountedRef.current || !isPickedUpRef.current) return;

        // Replay welcome message after silence gap
        if (cfg.welcomeMessage) {
          playAudio(cfg.welcomeMessage, false);
        }
      }, silenceGapMs);
    }
  }, [mode, shouldLoop, playAudio, cfg.welcomeMessage, silenceGapMs]);

  // ---- Handle audio error ----
  const handleAudioError = useCallback(() => {
    if (!mountedRef.current) return;
    isPlayingRef.current = false;
    setIsPlaying(false);
    setStatus('error');

    const currentSrc = audioRef.current ? audioRef.current.src : 'unknown';
    appShell.send('error', { type: 'playback', message: 'Audio failed to load: ' + currentSrc });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setStatus]);

  // ==========================================
  // SINGLE MODE — monophone pickup/hangup
  // ==========================================

  useEffect(() => {
    if (mode !== 'single') return;

    if (isPickedUp) {
      playAudio(cfg.audioUrl);
    } else {
      cancelAllTimers();
      if (isPlayingRef.current) {
        fadeOutAudio();
      }
    }
  }, [mode, isPickedUp, cfg.audioUrl, playAudio, fadeOutAudio, cancelAllTimers]);

  // ==========================================
  // MULTI MODE — monophone pickup/hangup + buttons
  // ==========================================

  // Monophone pickup → play welcome; hangup → stop everything
  useEffect(() => {
    if (mode !== 'multi') return;

    if (isPickedUp) {
      // Pickup: play welcome message after delay
      if (cfg.welcomeMessage) {
        welcomePlayedRef.current = true;
        playAudio(cfg.welcomeMessage);
      }
    } else {
      // Hangup: stop all audio immediately, reset to idle
      stopAll();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, isPickedUp]);

  // Handle button activation (shared by hardware + touch)
  const handleButtonActivate = useCallback((btn: ButtonItem) => {
    // Only allow button press when handset is up (or in sim mode)
    if (!isPickedUpRef.current) return;
    setActiveButton(btn);
    playAudio(btn.audioUrl, false); // no delay for button switch
  }, [playAudio]);

  const handleStop = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    isPlayingRef.current = false;
    setIsPlaying(false);
    setActiveButton(null);

    // After manual stop, replay welcome if handset still up
    if (isPickedUpRef.current && cfg.welcomeMessage) {
      silenceTimerRef.current = setTimeout(() => {
        silenceTimerRef.current = null;
        if (!mountedRef.current || !isPickedUpRef.current) return;
        playAudio(cfg.welcomeMessage, false);
      }, silenceGapMs);
    }
  }, [cfg.welcomeMessage, silenceGapMs, playAudio]);

  // Hardware button press events (from ESP32 via MQTT)
  useEffect(() => {
    if (mode !== 'multi') return;
    if (buttons.lastButtonId === null) return;

    const visibleButtons = (cfg.buttons || []).slice(0, MAX_BUTTONS);
    let match: ButtonItem | undefined;
    for (let i = 0; i < visibleButtons.length; i++) {
      if (visibleButtons[i].buttonId === buttons.lastButtonId) {
        match = visibleButtons[i];
        break;
      }
    }

    if (match) {
      handleButtonActivate(match);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, buttons.lastButtonId, buttons.lastPressTime]);

  // ---- Update heartbeat status ----
  useEffect(() => {
    if (mode === 'single') {
      if (isPickedUp) {
        setStatus('playing');
        setCurrentContent(cfg.audioUrl);
      } else {
        setStatus('idle');
        setCurrentContent(undefined);
      }
    } else {
      if (activeButton && isPlaying) {
        setStatus('playing');
        setCurrentContent(activeButton.audioUrl);
      } else if (isPickedUp) {
        setStatus('playing');
        setCurrentContent(undefined);
      } else {
        setStatus('idle');
        setCurrentContent(undefined);
      }
    }
  }, [mode, isPickedUp, activeButton, isPlaying, cfg.audioUrl, setStatus, setCurrentContent]);

  // ---- Idle state ----
  const isIdle = !isPickedUp;

  // ---- Styles ----

  const containerStyle: React.CSSProperties = {
    position: 'relative',
    width: '100%',
    height: '100%',
    backgroundColor: '#000',
    overflow: 'hidden',
  };

  // ---- Render ----

  return (
    <div style={containerStyle}>
      {/* Hidden audio element */}
      <audio
        ref={audioRef}
        src={mode === 'single' ? cfg.audioUrl : undefined}
        preload="auto"
        onEnded={handleAudioEnded}
        onError={handleAudioError}
      />

      {mode === 'single' ? (
        <SingleModeView
          cfg={cfg}
          isPickedUp={isPickedUp}
          isPlaying={isPlaying}
        />
      ) : (
        <MultiModeView
          cfg={cfg}
          activeButton={activeButton}
          isPlaying={isPlaying}
          onButtonTap={handleButtonActivate}
          onStop={handleStop}
          isPickedUp={isPickedUp}
        />
      )}

      {/* Idle screen overlay */}
      {cfg.idle && (
        <IdleScreen
          isIdle={isIdle}
          idle={cfg.idle}
        />
      )}

      {/* Test Simulator — toggle with triple-click on top-right corner */}
      <TestSimulator
        mode={mode}
        show={showSimulator}
        onToggle={() => { setShowSimulator(!showSimulator); }}
        isPickedUp={simPickedUp}
        onPickup={() => { setSimPickedUp(true); }}
        onHangup={() => { setSimPickedUp(false); }}
        buttons={(cfg.buttons || []).slice(0, MAX_BUTTONS)}
        onButtonPress={handleButtonActivate}
      />
    </div>
  );
}

// ==========================================
// SingleModeView — poster + now-playing overlay
// ==========================================

function SingleModeView(props: {
  cfg: MonophoneAudioConfig;
  isPickedUp: boolean;
  isPlaying: boolean;
}) {
  const cfg = props.cfg;
  const isPickedUp = props.isPickedUp;

  const backgroundImageStyle: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    backgroundImage: cfg.idleImageUrl ? 'url(' + cfg.idleImageUrl + ')' : 'none',
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
    transform: 'translateZ(0)',
  };

  const nowPlayingOverlayStyle: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    opacity: isPickedUp ? 1 : 0,
    transition: 'opacity 400ms ease-in-out',
    pointerEvents: 'none',
    transform: 'translateZ(0)',
  };

  const iconContainerStyle: React.CSSProperties = {
    width: '120px',
    height: '120px',
    borderRadius: '50%',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '24px',
    transform: 'translateZ(0)',
  };

  const nowPlayingTextStyle: React.CSSProperties = {
    color: '#ffffff',
    fontSize: '18px',
    fontWeight: '500',
    letterSpacing: '2px',
    textTransform: 'uppercase' as 'uppercase',
    marginTop: '16px',
    opacity: 0.8,
  };

  return (
    <>
      {cfg.idleVideoUrl ? (
        <VideoPlayer
          src={cfg.idleVideoUrl}
          muted={false}
          fit="cover"
          backgroundColor="#000"
          loop={true}
          autoPlay={true}
        />
      ) : cfg.idleImageUrl ? (
        <div style={backgroundImageStyle} />
      ) : null}

      <div style={nowPlayingOverlayStyle}>
        <div style={iconContainerStyle}>
          <SpeakerIcon />
        </div>
        <WaveformBars isPlaying={isPickedUp} />
        <div style={nowPlayingTextStyle}>Now Playing</div>
      </div>
    </>
  );
}

// ==========================================
// MultiModeView — button grid + active content
// ==========================================

function MultiModeView(props: {
  cfg: MonophoneAudioConfig;
  activeButton: ButtonItem | null;
  isPlaying: boolean;
  onButtonTap: (btn: ButtonItem) => void;
  onStop: () => void;
  isPickedUp: boolean;
}) {
  const cfg = props.cfg;
  const activeButton = props.activeButton;
  const isPlaying = props.isPlaying;
  const onButtonTap = props.onButtonTap;
  const onStop = props.onStop;

  const visibleButtons = (cfg.buttons || []).slice(0, MAX_BUTTONS);
  const useDoubleColumn = visibleButtons.length >= COLUMN_THRESHOLD;

  const selectionViewStyle: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px',
    boxSizing: 'border-box',
    opacity: activeButton ? 0 : 1,
    transition: 'opacity 400ms ease-in-out',
    pointerEvents: activeButton ? 'none' : 'auto',
    zIndex: activeButton ? 1 : 5,
    transform: 'translateZ(0)',
  };

  const titleStyle: React.CSSProperties = {
    color: '#ffffff',
    fontSize: '28px',
    fontWeight: '600',
    letterSpacing: '3px',
    textTransform: 'uppercase' as 'uppercase',
    marginBottom: '40px',
    opacity: 0.7,
    textAlign: 'center',
  };

  const gridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: useDoubleColumn ? '1fr 1fr' : '1fr',
    gap: '20px',
    width: '100%',
    maxWidth: useDoubleColumn ? '700px' : '400px',
    transform: 'translateZ(0)',
  };

  const activeViewStyle: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    opacity: activeButton ? 1 : 0,
    transition: 'opacity 400ms ease-in-out',
    pointerEvents: activeButton ? 'auto' : 'none',
    zIndex: activeButton ? 5 : 1,
    transform: 'translateZ(0)',
  };

  const activeMediaStyle: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    transform: 'translateZ(0)',
  };

  const activeImageStyle: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
    transform: 'translateZ(0)',
  };

  const nowPlayingOverlayStyle: React.CSSProperties = {
    position: 'absolute',
    bottom: 0,
    left: 0,
    width: '100%',
    padding: '32px',
    boxSizing: 'border-box',
    background: 'linear-gradient(transparent, rgba(0,0,0,0.8))',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    zIndex: 10,
    transform: 'translateZ(0)',
  };

  const nowPlayingLabelStyle: React.CSSProperties = {
    color: '#ffffff',
    fontSize: '14px',
    fontWeight: '500',
    letterSpacing: '2px',
    textTransform: 'uppercase' as 'uppercase',
    opacity: 0.6,
    marginBottom: '8px',
  };

  const nowPlayingTitleStyle: React.CSSProperties = {
    color: '#ffffff',
    fontSize: '24px',
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: '16px',
  };

  return (
    <>
      {/* Selection Grid View */}
      <div style={selectionViewStyle}>
        <div style={titleStyle}>Select a Track</div>
        <div style={gridStyle}>
          {visibleButtons.map((btn) => {
            return (
              <ButtonCard
                key={btn.buttonId}
                button={btn}
                isActive={activeButton !== null && activeButton.buttonId === btn.buttonId}
                onTap={() => { onButtonTap(btn); }}
              />
            );
          })}
        </div>
      </div>

      {/* Active Content View */}
      <div style={activeViewStyle}>
        {activeButton && activeButton.videoUrl ? (
          <div style={activeMediaStyle}>
            <VideoPlayer
              src={activeButton.videoUrl}
              muted={false}
              fit="cover"
              backgroundColor="#000"
              loop={true}
              autoPlay={true}
            />
          </div>
        ) : activeButton && activeButton.imageUrl ? (
          <div
            style={{
              ...activeImageStyle,
              backgroundImage: 'url(' + activeButton.imageUrl + ')',
            }}
          />
        ) : (
          <AudioVisualization isPlaying={isPlaying} />
        )}

        {activeButton && (
          <div style={nowPlayingOverlayStyle}>
            <div style={nowPlayingLabelStyle}>Now Playing</div>
            <div style={nowPlayingTitleStyle}>{activeButton.label}</div>
            <WaveformBars isPlaying={isPlaying} />
              <div
                onClick={onStop}
                onTouchEnd={(e) => { e.preventDefault(); onStop(); }}
                style={{
                marginTop: '24px',
                padding: '10px 28px',
                borderRadius: '24px',
                border: '1px solid rgba(255,255,255,0.3)',
                color: '#ffffff',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer',
                opacity: 0.7,
                transition: 'opacity 200ms',
                userSelect: 'none',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              ← Back to Tracks
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ==========================================
// ButtonCard - Visual representation of a button
// ==========================================

interface ButtonCardProps {
  button: ButtonItem;
  isActive: boolean;
  onTap: () => void;
}

function ButtonCard(props: ButtonCardProps) {
  const button = props.button;
  const isActive = props.isActive;
  const onTap = props.onTap;

  const cardStyle: React.CSSProperties = {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px 16px',
    borderRadius: '16px',
    backgroundColor: isActive ? 'rgba(255, 255, 255, 0.15)' : 'rgba(255, 255, 255, 0.06)',
    border: isActive ? '2px solid rgba(255, 255, 255, 0.6)' : '2px solid rgba(255, 255, 255, 0.12)',
    boxShadow: isActive ? '0 0 24px rgba(255, 255, 255, 0.2)' : 'none',
    cursor: 'pointer',
    userSelect: 'none',
    WebkitTapHighlightColor: 'transparent',
    transition: 'all 300ms ease-in-out',
    overflow: 'hidden',
    transform: 'translateZ(0)',
    minHeight: '100px',
  };

  const buttonNumberStyle: React.CSSProperties = {
    width: '48px',
    height: '48px',
    borderRadius: '50%',
    backgroundColor: isActive ? 'rgba(255, 255, 255, 0.25)' : 'rgba(255, 255, 255, 0.1)',
    border: isActive ? '2px solid rgba(255, 255, 255, 0.5)' : '2px solid rgba(255, 255, 255, 0.2)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '12px',
    transition: 'all 300ms ease-in-out',
    transform: 'translateZ(0)',
  };

  const numberTextStyle: React.CSSProperties = {
    color: '#ffffff',
    fontSize: '20px',
    fontWeight: '700',
    opacity: isActive ? 1 : 0.7,
  };

  const labelStyle: React.CSSProperties = {
    color: '#ffffff',
    fontSize: '16px',
    fontWeight: '500',
    textAlign: 'center',
    opacity: isActive ? 1 : 0.8,
    lineHeight: '1.3',
    transition: 'opacity 300ms ease-in-out',
  };

  const thumbnailOverlayStyle: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
    opacity: 0.2,
    pointerEvents: 'none' as const,
    transform: 'translateZ(0)',
  };

  return (
    <div
      style={cardStyle}
      onClick={onTap}
      onTouchEnd={(e) => { e.preventDefault(); onTap(); }}
    >
      {button.imageUrl && (
        <div
          style={{
            ...thumbnailOverlayStyle,
            backgroundImage: 'url(' + button.imageUrl + ')',
          }}
        />
      )}
      <div style={{ ...buttonNumberStyle, pointerEvents: 'none' as const }}>
        <span style={numberTextStyle}>{button.buttonId}</span>
      </div>
      <div style={{ ...labelStyle, pointerEvents: 'none' as const }}>{button.label}</div>
    </div>
  );
}

// ==========================================
// AudioVisualization - Fallback when no image/video
// ==========================================

function AudioVisualization(props: { isPlaying: boolean }) {
  const isPlaying = props.isPlaying;

  const containerStyle: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0a0a0a',
    transform: 'translateZ(0)',
  };

  const circleStyle: React.CSSProperties = {
    width: isPlaying ? '200px' : '120px',
    height: isPlaying ? '200px' : '120px',
    borderRadius: '50%',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    border: '2px solid rgba(255, 255, 255, 0.15)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 600ms ease-in-out',
    transform: 'translateZ(0)',
  };

  const innerCircleStyle: React.CSSProperties = {
    width: isPlaying ? '120px' : '80px',
    height: isPlaying ? '120px' : '80px',
    borderRadius: '50%',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    border: '2px solid rgba(255, 255, 255, 0.1)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 600ms ease-in-out',
    transform: 'translateZ(0)',
  };

  return (
    <div style={containerStyle}>
      <div style={circleStyle}>
        <div style={innerCircleStyle}>
          <SpeakerIcon size={isPlaying ? 48 : 32} />
        </div>
      </div>
    </div>
  );
}

// ==========================================
// SpeakerIcon - SVG speaker/audio icon
// ==========================================

function SpeakerIcon(props?: { size?: number }) {
  const size = (props && props.size) || 56;

  const svgStyle: React.CSSProperties = {
    width: size + 'px',
    height: size + 'px',
    fill: '#ffffff',
    opacity: 0.9,
    transition: 'all 400ms ease-in-out',
  };

  return (
    <svg style={svgStyle} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
    </svg>
  );
}

// ==========================================
// WaveformBars - Animated audio waveform
// ==========================================

function WaveformBars(props: { isPlaying: boolean }) {
  const isPlaying = props.isPlaying;

  const containerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '3px',
    height: '40px',
  };

  const barHeights = [12, 20, 32, 20, 12];
  const barDelays = [0, 150, 300, 450, 600];

  const bars = [];
  for (let i = 0; i < barHeights.length; i++) {
    const barStyle: React.CSSProperties = {
      width: '4px',
      height: isPlaying ? barHeights[i] + 'px' : '4px',
      backgroundColor: '#ffffff',
      borderRadius: '2px',
      transition: 'height 300ms ease-in-out',
      transitionDelay: barDelays[i] + 'ms',
      opacity: 0.8,
      transform: 'translateZ(0)',
    };
    bars.push(<div key={i} style={barStyle} />);
  }

  return <div style={containerStyle}>{bars}</div>;
}

// ==========================================
// TestSimulator — on-screen controls for testing without hardware
// Toggle visibility by clicking the top-right corner 3 times
// ==========================================

interface TestSimulatorProps {
  mode: 'single' | 'multi';
  show: boolean;
  onToggle: () => void;
  isPickedUp: boolean;
  onPickup: () => void;
  onHangup: () => void;
  buttons: ButtonItem[];
  onButtonPress: (btn: ButtonItem) => void;
}

function TestSimulator(props: TestSimulatorProps) {
  const show = props.show;
  const onToggle = props.onToggle;
  const isPickedUp = props.isPickedUp;
  const onPickup = props.onPickup;
  const onHangup = props.onHangup;
  const mode = props.mode;
  const buttons = props.buttons;
  const onButtonPress = props.onButtonPress;

  const clickCountRef = useRef(0);
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Triple-click handler for the toggle hotspot
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

  // Hotspot — always rendered (invisible 60×60 top-right corner)
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

  // Panel styles
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
    maxWidth: '280px',
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

  const btnBase: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '8px 16px',
    borderRadius: '8px',
    border: 'none',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '600',
    transition: 'all 150ms',
    userSelect: 'none',
    WebkitTapHighlightColor: 'transparent',
  };

  const pickupBtnStyle: React.CSSProperties = {
    ...btnBase,
    backgroundColor: isPickedUp ? '#dc2626' : '#16a34a',
    color: '#fff',
    width: '100%',
  };

  const simBtnStyle: React.CSSProperties = {
    ...btnBase,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    color: '#fff',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    padding: '6px 12px',
    fontSize: '12px',
    flex: '1',
  };

  const statusDotStyle: React.CSSProperties = {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    backgroundColor: isPickedUp ? '#22c55e' : '#ef4444',
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

        {/* Status */}
        <div style={{ marginBottom: '12px', fontSize: '12px', opacity: 0.7 }}>
          <span style={statusDotStyle} />
          Handset: {isPickedUp ? 'PICKED UP' : 'ON HOOK'}
        </div>

        {/* Pickup / Hangup */}
        <div
          style={pickupBtnStyle}
          onClick={() => {
            if (isPickedUp) {
              onHangup();
            } else {
              onPickup();
            }
          }}
        >
          {isPickedUp ? 'Hang Up' : 'Pick Up'}
        </div>

        {/* Button panel (multi mode only) */}
        {mode === 'multi' && buttons.length > 0 && (
          <div style={{ marginTop: '12px' }}>
            <div style={{ fontSize: '11px', opacity: 0.5, marginBottom: '6px', textTransform: 'uppercase' as 'uppercase', letterSpacing: '1px' }}>
              Buttons
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {buttons.map((btn) => {
                return (
                  <div
                    key={btn.buttonId}
                    style={simBtnStyle}
                    onClick={() => { onButtonPress(btn); }}
                  >
                    {btn.buttonId}: {btn.label || '—'}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Keyboard shortcuts hint */}
        <div style={{ marginTop: '12px', fontSize: '11px', opacity: 0.4, lineHeight: '1.4' }}>
          Triple-click top-right corner to hide
        </div>
      </div>
    </>
  );
}

export { MonophoneAudioTemplate };
export type { MonophoneAudioTemplateProps };
