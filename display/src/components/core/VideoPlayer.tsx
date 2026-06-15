import { useCallback, useEffect, useRef, useState } from 'react';

interface VideoPlayerProps {
  src: string;
  muted?: boolean;
  volume?: number;
  fit?: 'cover' | 'contain';
  backgroundColor?: string;
  loop?: boolean;
  autoPlay?: boolean;
  onError?: (error: Error) => void;
  onEnded?: () => void;
  className?: string;
}

const MAX_RETRIES = 3;
const CROSSFADE_MS = 500;
const WATCHDOG_INTERVAL_MS = 2_000;
const STALL_RECOVERY_MS = 8_000;
const RECOVERY_COOLDOWN_MS = 10_000;
const HAVE_CURRENT_DATA = 2;

function getBackoffDelay(attempt: number): number {
  // 1s, 2s, 4s
  return Math.pow(2, attempt) * 1000;
}

export function VideoPlayer({
  src,
  muted = false,
  volume = 100,
  fit = 'cover',
  backgroundColor = '#000',
  loop = true,
  autoPlay = true,
  onError,
  onEnded,
  className,
}: VideoPlayerProps) {
  const videoARef = useRef<HTMLVideoElement>(null);
  const videoBRef = useRef<HTMLVideoElement>(null);

  // Track which video element is currently active ('a' or 'b')
  const [activeVideo, setActiveVideo] = useState<'a' | 'b'>('a');
  const [, setIsTransitioning] = useState(false);

  // Opacity states for crossfade - controlled via state for inline styles
  const [opacityA, setOpacityA] = useState(1);
  const [opacityB, setOpacityB] = useState(0);

  // Track the src that is currently loaded on the active video
  const activeSrcRef = useRef<string>(src);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTransitioningRef = useRef(false);
  const mountedRef = useRef(true);
  const lastPlaybackTimeRef = useRef(0);
  const lastProgressAtRef = useRef(Date.now());
  const lastRecoveryAtRef = useRef(0);

  // ─── Helpers ─────────────────────────────────────────────

  const getActiveVideoEl = useCallback((): HTMLVideoElement | null => {
    if (activeVideo === 'a') {
      return videoARef.current;
    }
    return videoBRef.current;
  }, [activeVideo]);

  const getStandbyVideoEl = useCallback((): HTMLVideoElement | null => {
    if (activeVideo === 'a') {
      return videoBRef.current;
    }
    return videoARef.current;
  }, [activeVideo]);

  const clearRetryTimer = useCallback(() => {
    if (retryTimerRef.current !== null) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  const applyAudioSettings = useCallback(
    (video: HTMLVideoElement): void => {
      video.muted = muted;
      if (!muted) {
        video.volume = Math.max(0, Math.min(1, volume / 100));
      }
    },
    [muted, volume],
  );

  // ─── Safe play wrapper ───────────────────────────────────
  // Handles autoplay policy: try with current muted state,
  // if rejected try again muted.

  const safePlay = useCallback(
    (video: HTMLVideoElement): void => {
      if (!video) return;
      applyAudioSettings(video);

      let playResult;
      try {
        playResult = video.play();
      } catch (_e) {
        // Synchronous throw on very old browsers - ignore
        return;
      }

      if (playResult && typeof playResult.then === 'function') {
        playResult.then(() => {
          // Playing successfully
        }).catch(() => {
          // Autoplay was blocked - try muted
          if (!video.muted) {
            video.muted = true;
            let retryResult;
            try {
              retryResult = video.play();
            } catch (_e2) {
              return;
            }
            if (retryResult && typeof retryResult.then === 'function') {
              retryResult.then(() => {
                // Re-apply requested audio state (for non-muted playback paths)
                applyAudioSettings(video);
              }).catch(() => {
                // Still blocked - nothing more we can do
              });
            }
          }
        });
      }
    },
    [applyAudioSettings],
  );

  const recoverActiveVideo = useCallback(
    (reason: string): void => {
      const now = Date.now();
      if (now - lastRecoveryAtRef.current < RECOVERY_COOLDOWN_MS) return;

      const video = getActiveVideoEl();
      const videoSrc = activeSrcRef.current || src;
      if (!video || !videoSrc || isTransitioningRef.current) return;

      lastRecoveryAtRef.current = now;

      const duration = Number.isFinite(video.duration) ? video.duration : 0;
      const currentTime = Number.isFinite(video.currentTime) ? video.currentTime : 0;
      const resumeTime = duration > 1
        ? Math.min(Math.max(0, currentTime + 0.25), Math.max(0, duration - 0.5))
        : 0;

      let handleReady: (() => void) | null = null;
      let fallbackTimer: ReturnType<typeof setTimeout> | null = null;

      const cleanup = () => {
        if (handleReady) {
          video.removeEventListener('canplay', handleReady);
          video.removeEventListener('loadedmetadata', handleReady);
        }
        if (fallbackTimer !== null) {
          clearTimeout(fallbackTimer);
          fallbackTimer = null;
        }
      };

      handleReady = () => {
        cleanup();
        if (!mountedRef.current) return;

        if (resumeTime > 0) {
          try {
            video.currentTime = resumeTime;
          } catch {
            // If the seek is rejected during recovery, replaying from the start is still better than a frozen frame.
          }
        }

        lastPlaybackTimeRef.current = video.currentTime;
        lastProgressAtRef.current = Date.now();
        safePlay(video);
      };

      try {
        video.pause();
        video.removeAttribute('src');
        video.load();
        video.addEventListener('loadedmetadata', handleReady, { once: true });
        video.addEventListener('canplay', handleReady, { once: true });
        video.preload = 'auto';
        video.src = videoSrc;
        video.load();

        fallbackTimer = setTimeout(() => {
          handleReady?.();
        }, 3_000);
      } catch (err) {
        cleanup();
        onError?.(err instanceof Error ? err : new Error(`Video recovery failed after ${reason}`));
      }
    },
    [getActiveVideoEl, onError, safePlay, src],
  );

  // ─── Load video with retry logic ─────────────────────────

  const loadVideoWithRetry = useCallback(
    (video: HTMLVideoElement, videoSrc: string, attempt: number): void => {
      if (!mountedRef.current) return;

      clearRetryTimer();

      let handleCanPlay: (() => void) | null = null;
      let handleError: (() => void) | null = null;

      const cleanup = () => {
        if (handleCanPlay) {
          video.removeEventListener('canplaythrough', handleCanPlay);
        }
        if (handleError) {
          video.removeEventListener('error', handleError);
        }
      };

      handleCanPlay = () => {
        cleanup();
        if (!mountedRef.current) return;
        retryCountRef.current = 0;

        if (autoPlay) {
          safePlay(video);
        }
      };

      handleError = () => {
        cleanup();
        if (!mountedRef.current) return;

        if (attempt < MAX_RETRIES) {
          const delay = getBackoffDelay(attempt);
          retryTimerRef.current = setTimeout(() => {
            if (!mountedRef.current) return;
            loadVideoWithRetry(video, videoSrc, attempt + 1);
          }, delay);
        } else {
          // All retries exhausted
          if (onError) {
            onError(new Error(`Video failed to load after ${MAX_RETRIES} attempts: ${videoSrc}`));
          }
        }
      };

      video.addEventListener('canplaythrough', handleCanPlay, { once: true });
      video.addEventListener('error', handleError, { once: true });

      video.preload = 'auto';
      video.src = videoSrc;
      video.load();
    },
    [autoPlay, clearRetryTimer, onError, safePlay],
  );

  // ─── Crossfade transition ────────────────────────────────

  const crossfadeTo = useCallback(
    (newSrc: string): void => {
      if (isTransitioningRef.current) return;
      isTransitioningRef.current = true;
      setIsTransitioning(true);

      const standby = getStandbyVideoEl();
      if (!standby) {
        isTransitioningRef.current = false;
        setIsTransitioning(false);
        return;
      }

      let handleStandbyReady: (() => void) | null = null;
      let handleStandbyError: (() => void) | null = null;

      const cleanupStandby = () => {
        if (handleStandbyReady) {
          standby!.removeEventListener('canplaythrough', handleStandbyReady);
        }
        if (handleStandbyError) {
          standby!.removeEventListener('error', handleStandbyError);
        }
      };

      const attemptLoadStandby = (attemptNum: number) => {
        if (!mountedRef.current || !standby) return;

        cleanupStandby();

        handleStandbyReady = () => {
          cleanupStandby();
          if (!mountedRef.current || !standby) return;

          // Start playing standby before showing it (avoid black flash)
          safePlay(standby);

          // Perform the crossfade
          const nextActive: 'a' | 'b' = activeVideo === 'a' ? 'b' : 'a';

          if (nextActive === 'a') {
            setOpacityA(1);
            setOpacityB(0);
          } else {
            setOpacityA(0);
            setOpacityB(1);
          }

          // After transition completes, clean up old video
          setTimeout(() => {
            if (!mountedRef.current) return;

            const oldVideo = getActiveVideoEl();
            if (oldVideo) {
              oldVideo.pause();
              oldVideo.removeAttribute('src');
              oldVideo.load();
            }

            setActiveVideo(nextActive);
            activeSrcRef.current = newSrc;
            isTransitioningRef.current = false;
            setIsTransitioning(false);
          }, CROSSFADE_MS + 50);
        };

        handleStandbyError = () => {
          cleanupStandby();
          if (!mountedRef.current) return;

          if (attemptNum < MAX_RETRIES) {
            const delay = getBackoffDelay(attemptNum);
            retryTimerRef.current = setTimeout(() => {
              if (!mountedRef.current) return;
              attemptLoadStandby(attemptNum + 1);
            }, delay);
          } else {
            isTransitioningRef.current = false;
            setIsTransitioning(false);
            if (onError) {
              onError(new Error(`Video crossfade failed after ${MAX_RETRIES} attempts: ${newSrc}`));
            }
          }
        };

        standby!.addEventListener('canplaythrough', handleStandbyReady, { once: true });
        standby!.addEventListener('error', handleStandbyError, { once: true });

        standby!.preload = 'auto';
        standby!.src = newSrc;
        standby!.load();
      };

      attemptLoadStandby(0);
    },
    [activeVideo, getActiveVideoEl, getStandbyVideoEl, onError, safePlay],
  );

  // ─── Initial mount: load the first video ─────────────────

  useEffect(() => {
    mountedRef.current = true;

    const video = videoARef.current;
    if (video && src) {
      loadVideoWithRetry(video, src, 0);
      activeSrcRef.current = src;
    }

    return () => {
      mountedRef.current = false;
    };
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Handle src changes (crossfade) ──────────────────────

  useEffect(() => {
    // Skip if it's the same src or we're already transitioning
    if (src === activeSrcRef.current) return;
    if (!src) return;

    crossfadeTo(src);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  // ─── Muted / volume sync ─────────────────────────────────

  useEffect(
    () => {
      const active = getActiveVideoEl();
      if (active) {
        active.muted = muted;
        if (!muted) {
          active.volume = Math.max(0, Math.min(1, volume / 100));
        }
      }
    },
    [muted, volume, activeVideo, getActiveVideoEl],
  );

  // ─── Loop / ended handling ───────────────────────────────

  useEffect(
    () => {
      const videoA = videoARef.current;
      const videoB = videoBRef.current;

      const handleEndedA = () => {
        if (!mountedRef.current) return;
        if (loop) {
          if (videoA) {
            videoA.currentTime = 0;
            safePlay(videoA);
          }
        } else {
          onEnded?.();
        }
      };

      const handleEndedB = () => {
        if (!mountedRef.current) return;
        if (loop) {
          if (videoB) {
            videoB.currentTime = 0;
            safePlay(videoB);
          }
        } else {
          onEnded?.();
        }
      };

      if (videoA) {
        videoA.addEventListener('ended', handleEndedA);
      }
      if (videoB) {
        videoB.addEventListener('ended', handleEndedB);
      }

      return () => {
        if (videoA) {
          videoA.removeEventListener('ended', handleEndedA);
        }
        if (videoB) {
          videoB.removeEventListener('ended', handleEndedB);
        }
      };
    },
    [loop, onEnded, safePlay],
  );

  // ─── Playback watchdog ──────────────────────────────────
  // Kiosk Chrome can occasionally leave a video mounted but frozen. Recover by
  // reloading only the active element after playback time stops advancing.

  useEffect(() => {
    if (!autoPlay || !src) return;

    lastPlaybackTimeRef.current = 0;
    lastProgressAtRef.current = Date.now();

    const interval = setInterval(() => {
      if (!mountedRef.current || isTransitioningRef.current) return;

      const video = getActiveVideoEl();
      if (!video || video.ended) return;

      if (video.paused) {
        if (video.readyState >= HAVE_CURRENT_DATA) {
          safePlay(video);
        }
        return;
      }

      const currentTime = Number.isFinite(video.currentTime) ? video.currentTime : 0;
      const progressed = Math.abs(currentTime - lastPlaybackTimeRef.current) > 0.05;

      if (progressed) {
        lastPlaybackTimeRef.current = currentTime;
        lastProgressAtRef.current = Date.now();
        return;
      }

      if (video.readyState >= HAVE_CURRENT_DATA && Date.now() - lastProgressAtRef.current > STALL_RECOVERY_MS) {
        recoverActiveVideo('stalled playback');
      }
    }, WATCHDOG_INTERVAL_MS);

    return () => {
      clearInterval(interval);
    };
  }, [autoPlay, activeVideo, getActiveVideoEl, recoverActiveVideo, safePlay, src]);

  // ─── Clean unmount ───────────────────────────────────────

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      clearRetryTimer();

      const videoA = videoARef.current;
      const videoB = videoBRef.current;

      if (videoA) {
        videoA.pause();
        videoA.removeAttribute('src');
        videoA.load();
      }
      if (videoB) {
        videoB.pause();
        videoB.removeAttribute('src');
        videoB.load();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Shared video element styles ─────────────────────────

  const baseVideoStyle: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    objectFit: fit,
    display: 'block',
    transform: 'translateZ(0)',
    transition: `opacity ${CROSSFADE_MS}ms ease-in-out`,
  };

  const videoAStyle: React.CSSProperties = {
    ...baseVideoStyle,
    opacity: opacityA,
    zIndex: activeVideo === 'a' ? 1 : 0,
  };

  const videoBStyle: React.CSSProperties = {
    ...baseVideoStyle,
    opacity: opacityB,
    zIndex: activeVideo === 'b' ? 1 : 0,
  };

  const containerStyle: React.CSSProperties = {
    position: 'relative',
    width: '100%',
    height: '100%',
    backgroundColor,
    overflow: 'hidden',
  };

  return (
    <div style={containerStyle} className={className}>
      <video
        ref={videoARef}
        style={videoAStyle}
        muted={muted}
        loop={loop}
        playsInline
        preload="auto"
      />
      <video
        ref={videoBRef}
        style={videoBStyle}
        muted={muted}
        loop={loop}
        playsInline
        preload="auto"
      />
    </div>
  );
}
